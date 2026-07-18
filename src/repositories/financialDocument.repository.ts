import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { add, formatCentsBRL, type Cents } from "@/lib/money"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import { timed } from "@/lib/metrics"
import type { FinancialDocumentQueryInput } from "@/validations/financialDocument"
import { toSkip } from "@/lib/pagination"

const DOCUMENT_INCLUDE = {
  project:    { select: { id: true, name: true } },
  client:     { select: { id: true, name: true } },
  supplier:   { select: { id: true, name: true } },
  category:   { select: { id: true, name: true, direction: true } },
  costCenter: { select: { id: true, name: true } },
  // Payments must be nested here — the document detail screen computes
  // paid/remaining per installment from this, and without it every
  // installment silently renders as if it had zero payments even when
  // Payment rows exist (caught via browser testing, not unit tests: the
  // registerPayment repository test only exercises the write path).
  installments: { orderBy: { number: "asc" as const }, include: { payments: { orderBy: { createdAt: "desc" as const } } } },
} as const

interface CreateWithInstallmentsInput {
  workspaceId: string
  direction: "PAYABLE" | "RECEIVABLE"
  projectId?: string
  clientId?: string
  supplierId?: string
  categoryId: string
  costCenterId?: string
  description: string
  competencyDate: Date
  notes?: string
  createdByUserId: string
  installments: { amountCents: Cents; dueDate: Date }[]
}

export const financialDocumentRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.financialDocument.findFirst({ where: { id, workspaceId }, include: DOCUMENT_INCLUDE })
  },

  async findMany(workspaceId: string, query: FinancialDocumentQueryInput) {
    const { page, limit, direction, projectId, clientId, supplierId, categoryId, costCenterId, search, includeCancelled, sortBy, sortOrder } = query
    const skip = toSkip(page, limit)

    const where: Prisma.FinancialDocumentWhereInput = {
      workspaceId,
      ...(includeCancelled ? {} : { isCancelled: false }),
      ...(direction    && { direction }),
      ...(projectId    && { projectId }),
      ...(clientId     && { clientId }),
      ...(supplierId   && { supplierId }),
      ...(categoryId   && { categoryId }),
      ...(costCenterId && { costCenterId }),
      ...(search && { description: { contains: search, mode: "insensitive" } }),
    }

    const [data, total] = await Promise.all([
      prisma.financialDocument.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder }, include: DOCUMENT_INCLUDE }),
      prisma.financialDocument.count({ where }),
    ])
    return { data, total }
  },

  // The one genuinely multi-collection write in this domain — kept inside
  // the repository (not the service) so "services never call prisma
  // directly" holds even for this. $transaction (via withTransactionRetry,
  // see RC-2.4) is required here: Mongo enforces no referential integrity
  // between a document's totalAmountCents and the sum of its installments,
  // a crash between the two creates would otherwise leave an orphaned or
  // mismatched document.
  //
  // `db` (optional, trailing) lets a caller that's already inside its own
  // transaction compose this write atomically with its own — same idiom as
  // clientRepository's `Db` param (client.repository.ts). When passed, this
  // function runs directly against that transaction client and returns
  // without its own retry/timed wrapper, since the caller's own
  // withTransactionRetry already covers the whole outer transaction (a
  // nested $transaction/retry here would be redundant and Mongo doesn't
  // support nesting transactions anyway). Compras' purchaseOrder.repository
  // #approve is the first consumer of this — see COMPRAS_ARCHITECTURE_DECISIONS.md ADR-017.
  createWithInstallments(input: CreateWithInstallmentsInput, correlationId = newCorrelationId(), db?: PrismaTransactionClient) {
    const totalAmountCents = add(...input.installments.map((i) => i.amountCents))
    const base = { correlationId, workspaceId: input.workspaceId, userId: input.createdByUserId, entity: "FinancialDocument", op: "createWithInstallments" }

    const core = async (tx: PrismaTransactionClient) => {
      const doc = await tx.financialDocument.create({
        data: {
          workspaceId:      input.workspaceId,
          direction:        input.direction,
          projectId:        input.projectId,
          clientId:         input.clientId,
          supplierId:       input.supplierId,
          categoryId:       input.categoryId,
          costCenterId:     input.costCenterId,
          description:      input.description,
          competencyDate:   input.competencyDate,
          notes:            input.notes,
          createdByUserId:  input.createdByUserId,
          totalAmountCents,
        },
      })

      await tx.installment.createMany({
        data: input.installments.map((inst, idx) => ({
          workspaceId:         input.workspaceId,
          financialDocumentId: doc.id,
          number:              idx + 1,
          amountCents:         inst.amountCents,
          dueDate:             inst.dueDate,
        })),
      })

      auditLog({ ...base, event: "document_created", entityId: doc.id, total: formatCentsBRL(totalAmountCents), installmentCount: input.installments.length })
      return tx.financialDocument.findFirstOrThrow({ where: { id: doc.id }, include: DOCUMENT_INCLUDE })
    }

    if (db) return core(db)
    return timed("financial.createWithInstallments", () => withTransactionRetry(() => prisma.$transaction(core), { context: base }))
  },

  update(id: string, workspaceId: string, data: Prisma.FinancialDocumentUpdateInput) {
    return prisma.financialDocument.updateMany({ where: { id, workspaceId, isCancelled: false }, data })
  },

  // RC-2.3 — referential guards used before a hard delete of Project/Client
  // elsewhere in the app (those predate this module and have no built-in
  // awareness of it). Cancelled documents still count: a cancelled
  // FinancialDocument is a soft-deleted record, not a deleted one, and its
  // projectId/clientId reference must stay resolvable for audit history.
  async existsForProject(projectId: string, workspaceId: string) {
    const count = await prisma.financialDocument.count({ where: { projectId, workspaceId } })
    return count > 0
  },

  async existsForClient(clientId: string, workspaceId: string) {
    const count = await prisma.financialDocument.count({ where: { clientId, workspaceId } })
    return count > 0
  },

  // Blocks cancellation once real money has moved — reversal (estorno) is a
  // deliberately deferred v2 feature (see Payment's append-only comment in
  // schema.prisma), so this MVP cannot yet unwind a paid installment.
  //
  // RC-3.1 — this used to have a documented residual race: the check-then-
  // cancel here is one $transaction, but a payment being registered
  // concurrently wrote only to Installment/Payment, never to this
  // FinancialDocument, so Mongo's conflict detection never saw the two
  // transactions as touching the same data and could interleave them —
  // a payment could land in the gap between this function's paymentCount
  // check and its cancel write, producing a cancelled document with a live
  // payment against it.
  //
  // Fixed by making BOTH sides of the race genuinely write the same
  // document: installment.repository.ts#registerPayment now performs a
  // conditional `isCancelled: false` write against this exact
  // FinancialDocument (bumping `version`) before it creates a Payment. Once
  // both writers touch the same document inside overlapping transactions,
  // MongoDB's own snapshot-isolation engine detects the write-write
  // conflict and aborts the loser with a retryable TransientTransactionError
  // — withTransactionRetry (RC-2.4) retries it, and on retry each side
  // re-reads fresh state and reaches the correct outcome:
  //   - cancel committed first  → the payment's retry re-checks
  //     `isCancelled: false`, matches nothing, and rejects with
  //     FINANCIAL_DOCUMENT_CANCELLED (transaction rolled back, no Payment
  //     created).
  //   - payment committed first → this function's retry re-counts payments,
  //     finds paymentCount > 0, and correctly refuses to cancel.
  // Neither outcome is a race anymore — one of the two writers is always
  // forced to observe the other's committed effect before it can proceed.
  async cancelIfNoPayments(id: string, workspaceId: string, correlationId = newCorrelationId()): Promise<{ cancelled: boolean; hadPayments: boolean }> {
    const base = { correlationId, workspaceId, entity: "FinancialDocument", entityId: id, op: "cancelIfNoPayments" }
    return timed("financial.cancelIfNoPayments", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const paymentCount = await tx.payment.count({ where: { installment: { financialDocumentId: id } } })
      if (paymentCount > 0) {
        auditLog({ ...base, event: "document_cancel_rejected", reason: "FINANCIAL_DOCUMENT_HAS_PAYMENTS" })
        return { cancelled: false, hadPayments: true }
      }

      const result = await tx.financialDocument.updateMany({
        where: { id, workspaceId, isCancelled: false },
        data: { isCancelled: true, version: { increment: 1 } },
      })
      if (result.count > 0) auditLog({ ...base, event: "document_cancelled" })
      return { cancelled: result.count > 0, hadPayments: false }
    }), { context: base }))
  },
}
