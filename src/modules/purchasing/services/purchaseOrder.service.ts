import { purchaseOrderRepository } from "@/repositories/purchaseOrder.repository"
import { financialCategoryRepository } from "@/repositories/financialCategory.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { reaisToCents } from "@/lib/money"
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput, PurchaseOrderQueryInput } from "@/validations/purchaseOrder"

// A purchase order always generates a PAYABLE FinancialDocument on approval
// (ADR-016/017) — its category must already be a Despesa category, checked
// up front rather than discovered at approve() time.
async function assertPayableCategory(categoryId: string, workspaceId: string) {
  const category = await financialCategoryRepository.findById(categoryId, workspaceId)
  if (!category) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_NOT_FOUND)
  if (category.direction !== "PAYABLE") throw new AppError(ErrorCode.PURCHASE_ORDER_CATEGORY_DIRECTION_MISMATCH)
}

export const purchaseOrderService = {
  async list(workspaceId: string, query: PurchaseOrderQueryInput) {
    const { data, total } = await purchaseOrderRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const po = await purchaseOrderRepository.findById(id, workspaceId)
    if (!po) throw new AppError(ErrorCode.PURCHASE_ORDER_NOT_FOUND)
    return po
  },

  async create(workspaceId: string, userId: string, input: CreatePurchaseOrderInput) {
    await assertWorkspaceReferences(workspaceId, {
      supplierId:          input.supplierId,
      projectId:           input.projectId,
      financialCategoryId: input.categoryId,
      costCenterId:        input.costCenterId,
    })
    await assertPayableCategory(input.categoryId, workspaceId)

    return purchaseOrderRepository.create({
      workspaceId,
      supplierId:      input.supplierId,
      projectId:       input.projectId,
      categoryId:      input.categoryId,
      costCenterId:    input.costCenterId,
      description:     input.description,
      dueDate:         input.dueDate,
      notes:           input.notes,
      createdByUserId: userId,
      idempotencyKey:  input.idempotencyKey,
      items: input.items.map((item) => ({
        description: item.description,
        quantity:    item.quantity,
        unitCents:   reaisToCents(item.unitPrice),
      })),
    })
  },

  async update(id: string, workspaceId: string, input: UpdatePurchaseOrderInput) {
    const po = await this.getById(id, workspaceId)
    if (po.status !== "DRAFT") throw new AppError(ErrorCode.PURCHASE_ORDER_NOT_DRAFT)

    await assertWorkspaceReferences(workspaceId, {
      supplierId:          input.supplierId,
      projectId:           input.projectId,
      financialCategoryId: input.categoryId,
      costCenterId:        input.costCenterId,
    })
    if (input.categoryId) await assertPayableCategory(input.categoryId, workspaceId)

    const items = input.items?.map((item) => ({
      description: item.description,
      quantity:    item.quantity,
      unitCents:   reaisToCents(item.unitPrice),
    }))

    return purchaseOrderRepository.update(id, workspaceId, {
      ...(input.supplierId   && { supplier: { connect: { id: input.supplierId } } }),
      ...(input.projectId    !== undefined && { project: input.projectId ? { connect: { id: input.projectId } } : { disconnect: true } }),
      ...(input.categoryId   && { category: { connect: { id: input.categoryId } } }),
      ...(input.costCenterId !== undefined && { costCenter: input.costCenterId ? { connect: { id: input.costCenterId } } : { disconnect: true } }),
      ...(input.description  && { description: input.description }),
      ...(input.dueDate      && { dueDate: input.dueDate }),
      ...(input.notes        !== undefined && { notes: input.notes }),
    }, items)
  },

  // ADR-017 — the repository returns { purchaseOrder, financialDocument },
  // including on the idempotent-replay path (CAS-miss against an already-
  // APPROVED order this exact request produced).
  async approve(id: string, workspaceId: string, userId: string) {
    await this.getById(id, workspaceId) // NOT_FOUND surfaces here, before entering a transaction
    return purchaseOrderRepository.approve(id, workspaceId, userId)
  },

  async cancel(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    return purchaseOrderRepository.cancel(id, workspaceId)
  },

  // Physical delete — only ever reachable from DRAFT (ADR-018: DRAFT never
  // had a financial link, so there's no history to protect).
  async remove(id: string, workspaceId: string) {
    const po = await this.getById(id, workspaceId)
    if (po.status !== "DRAFT") throw new AppError(ErrorCode.PURCHASE_ORDER_NOT_DRAFT)
    await purchaseOrderRepository.delete(id, workspaceId)
  },
}
