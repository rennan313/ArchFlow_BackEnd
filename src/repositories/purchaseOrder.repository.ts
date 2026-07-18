import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { financialDocumentRepository } from "./financialDocument.repository"
import { add, scale, formatCentsBRL, type Cents } from "@/lib/money"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import { timed } from "@/lib/metrics"
import type { PurchaseOrderQueryInput } from "@/validations/purchaseOrder"
import { toSkip } from "@/lib/pagination"

const PURCHASE_ORDER_INCLUDE = {
  supplier:   { select: { id: true, name: true } },
  project:    { select: { id: true, name: true } },
  category:   { select: { id: true, name: true } },
  costCenter: { select: { id: true, name: true } },
  items:      { orderBy: { createdAt: "asc" as const } },
} as const

interface CreateItemInput {
  description: string
  quantity: number
  unitCents: Cents
}

interface CreatePurchaseOrderInput {
  workspaceId: string
  supplierId: string
  projectId?: string
  categoryId: string
  costCenterId?: string
  description: string
  dueDate: Date
  notes?: string
  createdByUserId: string
  idempotencyKey: string
  items: CreateItemInput[]
}

// Prisma's error code for a unique-constraint violation — same detection
// used by installment.repository.ts#registerPayment for the identical
// replay-race reason (see that file's comment).
function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export const purchaseOrderRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.purchaseOrder.findFirst({ where: { id, workspaceId }, include: PURCHASE_ORDER_INCLUDE })
  },

  findByIdempotencyKey(idempotencyKey: string) {
    return prisma.purchaseOrder.findUnique({ where: { idempotencyKey }, include: PURCHASE_ORDER_INCLUDE })
  },

  async findMany(workspaceId: string, query: PurchaseOrderQueryInput) {
    const { page, limit, status, supplierId, projectId, search, sortBy, sortOrder } = query
    const skip = toSkip(page, limit)

    const where: Prisma.PurchaseOrderWhereInput = {
      workspaceId,
      ...(status     && { status }),
      ...(supplierId && { supplierId }),
      ...(projectId  && { projectId }),
      ...(search && { description: { contains: search, mode: "insensitive" } }),
    }

    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder }, include: PURCHASE_ORDER_INCLUDE }),
      prisma.purchaseOrder.count({ where }),
    ])
    return { data, total }
  },

  // ADR-017 — idempotency via client-generated key, same shape as
  // registerPayment: pre-check inside the transaction on every attempt
  // (including retries), @unique index as the final safety net, P2002
  // caught and resolved by re-fetching the winner instead of erroring.
  async create(input: CreatePurchaseOrderInput, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId: input.workspaceId, userId: input.createdByUserId, entity: "PurchaseOrder", op: "create" }

    try {
      return await timed("purchasing.create", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const alreadyProcessed = await tx.purchaseOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: PURCHASE_ORDER_INCLUDE })
        if (alreadyProcessed) return alreadyProcessed

        const items = input.items.map((item) => ({ ...item, totalCents: scale(item.unitCents, item.quantity) }))
        const totalAmountCents = add(...items.map((i) => i.totalCents))

        const po = await tx.purchaseOrder.create({
          data: {
            workspaceId:      input.workspaceId,
            supplierId:       input.supplierId,
            projectId:        input.projectId,
            categoryId:       input.categoryId,
            costCenterId:     input.costCenterId,
            description:      input.description,
            dueDate:          input.dueDate,
            notes:            input.notes,
            createdByUserId:  input.createdByUserId,
            idempotencyKey:   input.idempotencyKey,
            totalAmountCents,
          },
        })

        await tx.purchaseOrderItem.createMany({
          data: items.map((item) => ({
            workspaceId:     input.workspaceId,
            purchaseOrderId: po.id,
            description:     item.description,
            quantity:        item.quantity,
            unitCents:       item.unitCents,
            totalCents:      item.totalCents,
          })),
        })

        auditLog({ ...base, event: "purchase_order_created", entityId: po.id, total: formatCentsBRL(totalAmountCents), itemCount: items.length })
        return tx.purchaseOrder.findFirstOrThrow({ where: { id: po.id }, include: PURCHASE_ORDER_INCLUDE })
      }), { context: base }))
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey)
        if (existing) {
          auditLog({ ...base, level: "warn", event: "duplicate_attempt", entityId: existing.id, idempotencyKey: input.idempotencyKey })
          return existing
        }
      }
      if (!(error instanceof AppError)) {
        auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      }
      throw error
    }
  },

  // DRAFT is the "still quoting" stage — unlike FinancialDocument's
  // installments (fixed at creation, see updateFinancialDocumentSchema's
  // comment), PurchaseOrderItems are expected to change while a quote is
  // being negotiated, so this replaces the whole item set atomically when
  // `items` is passed rather than leaving them fixed. The status precondition
  // is re-checked here too (ADR-006/007: repository never trusts the caller
  // already checked) via the same conditional-updateMany CAS shape used by
  // approve()/cancel() — a concurrent approve() racing this update() means
  // one of the two loses deterministically, never a silent lost update.
  async update(
    id: string,
    workspaceId: string,
    data: Prisma.PurchaseOrderUpdateInput,
    items?: CreateItemInput[],
    correlationId = newCorrelationId(),
  ) {
    const base = { correlationId, workspaceId, entity: "PurchaseOrder", entityId: id, op: "update" }

    return timed("purchasing.update", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const cas = await tx.purchaseOrder.updateMany({ where: { id, workspaceId, status: "DRAFT" }, data })

      if (cas.count === 0) {
        const current = await tx.purchaseOrder.findFirst({ where: { id, workspaceId } })
        if (!current) throw new AppError(ErrorCode.PURCHASE_ORDER_NOT_FOUND)
        throw new AppError(ErrorCode.PURCHASE_ORDER_NOT_DRAFT)
      }

      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id, workspaceId } })
        const withTotals = items.map((item) => ({ ...item, totalCents: scale(item.unitCents, item.quantity) }))
        await tx.purchaseOrderItem.createMany({
          data: withTotals.map((item) => ({
            workspaceId, purchaseOrderId: id,
            description: item.description, quantity: item.quantity,
            unitCents: item.unitCents, totalCents: item.totalCents,
          })),
        })
        await tx.purchaseOrder.update({ where: { id }, data: { totalAmountCents: add(...withTotals.map((i) => i.totalCents)) } })
      }

      auditLog({ ...base, event: "purchase_order_updated" })
      return tx.purchaseOrder.findFirstOrThrow({ where: { id }, include: PURCHASE_ORDER_INCLUDE })
    }), { context: base }))
  },

  // ADR-017 — approve() is a convergent status transition, not a
  // client-keyed idempotent write: the CAS precondition (`status: "DRAFT"`)
  // IS the "never twice" guarantee. Composes financialDocumentRepository
  // .createWithInstallments into THIS transaction (passing `tx` as the
  // trailing `db` param) so the status flip and the FinancialDocument+
  // Installment creation commit atomically — either both happen or
  // neither does (ADR-003). On CAS-miss, re-fetches: if the PO is already
  // APPROVED with a financialDocumentId (this exact operation's own
  // effect, replayed), returns it as a successful idempotent replay
  // instead of erroring — mirrors the P2002-recovery spirit of
  // registerPayment/create() above, applied to a CAS instead of a unique
  // index. Only a genuine conflict (CANCELLED, or any other unexpected
  // state) throws PURCHASE_ORDER_ALREADY_DECIDED.
  async approve(id: string, workspaceId: string, userId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "PurchaseOrder", entityId: id, op: "approve" }

    return timed("purchasing.approve", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const cas = await tx.purchaseOrder.updateMany({
        where: { id, workspaceId, status: "DRAFT" },
        data: { status: "APPROVED", version: { increment: 1 } },
      })

      if (cas.count === 0) {
        const current = await tx.purchaseOrder.findFirst({ where: { id, workspaceId }, include: PURCHASE_ORDER_INCLUDE })
        if (!current) throw new AppError(ErrorCode.PURCHASE_ORDER_NOT_FOUND)
        if (current.status === "APPROVED" && current.financialDocumentId) {
          auditLog({ ...base, level: "warn", event: "duplicate_attempt" })
          const financialDocument = await tx.financialDocument.findUnique({ where: { id: current.financialDocumentId } })
          return { purchaseOrder: current, financialDocument }
        }
        auditLog({ ...base, level: "warn", event: "purchase_order_approve_rejected", reason: current.status })
        throw new AppError(ErrorCode.PURCHASE_ORDER_ALREADY_DECIDED)
      }

      const po = await tx.purchaseOrder.findFirstOrThrow({ where: { id }, include: PURCHASE_ORDER_INCLUDE })

      const financialDocument = await financialDocumentRepository.createWithInstallments({
        workspaceId,
        direction:       "PAYABLE",
        supplierId:      po.supplierId,
        projectId:       po.projectId ?? undefined,
        categoryId:      po.categoryId,
        costCenterId:    po.costCenterId ?? undefined,
        description:     po.description,
        competencyDate:  new Date(),
        notes:           po.notes ?? undefined,
        createdByUserId: userId,
        installments:    [{ amountCents: po.totalAmountCents, dueDate: po.dueDate }],
      }, correlationId, tx)

      const purchaseOrder = await tx.purchaseOrder.update({
        where: { id },
        data: { financialDocumentId: financialDocument.id },
        include: PURCHASE_ORDER_INCLUDE,
      })

      auditLog({ ...base, event: "purchase_order_approved", financialDocumentId: financialDocument.id, total: formatCentsBRL(po.totalAmountCents) })
      return { purchaseOrder, financialDocument }
    }), { context: base }))
  },

  // Same CAS shape as approve(), opposite destination. Never touches
  // FinancialDocument — a DRAFT purchase order never had a financial link
  // to begin with (ADR-018).
  async cancel(id: string, workspaceId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, entity: "PurchaseOrder", entityId: id, op: "cancel" }

    return timed("purchasing.cancel", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const cas = await tx.purchaseOrder.updateMany({
        where: { id, workspaceId, status: "DRAFT" },
        data: { status: "CANCELLED", version: { increment: 1 } },
      })

      if (cas.count === 0) {
        const current = await tx.purchaseOrder.findFirst({ where: { id, workspaceId } })
        if (!current) throw new AppError(ErrorCode.PURCHASE_ORDER_NOT_FOUND)
        if (current.status === "CANCELLED") {
          auditLog({ ...base, level: "warn", event: "duplicate_attempt" })
          return current
        }
        auditLog({ ...base, level: "warn", event: "purchase_order_cancel_rejected", reason: current.status })
        throw new AppError(ErrorCode.PURCHASE_ORDER_ALREADY_DECIDED)
      }

      auditLog({ ...base, event: "purchase_order_cancelled" })
      return tx.purchaseOrder.findFirstOrThrow({ where: { id }, include: PURCHASE_ORDER_INCLUDE })
    }), { context: base }))
  },

  // Physical delete — only ever reachable from DRAFT (service enforces this
  // before calling), since DRAFT never had a financial link (ADR-018).
  delete(id: string, workspaceId: string) {
    return prisma.purchaseOrder.deleteMany({ where: { id, workspaceId, status: "DRAFT" } })
  },
}
