import { financialDocumentRepository } from "@/repositories/financialDocument.repository"
import { financialCategoryRepository } from "@/repositories/financialCategory.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { reaisToCents } from "@/lib/money"
import type { CreateFinancialDocumentInput, UpdateFinancialDocumentInput, FinancialDocumentQueryInput } from "@/validations/financialDocument"

async function assertCategoryDirection(categoryId: string, workspaceId: string, direction: "PAYABLE" | "RECEIVABLE") {
  const category = await financialCategoryRepository.findById(categoryId, workspaceId)
  if (!category) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_NOT_FOUND)
  if (category.direction !== direction) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_DIRECTION_MISMATCH)
}

export const financialDocumentService = {
  async list(workspaceId: string, query: FinancialDocumentQueryInput) {
    const { data, total } = await financialDocumentRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const doc = await financialDocumentRepository.findById(id, workspaceId)
    if (!doc) throw new AppError(ErrorCode.FINANCIAL_DOCUMENT_NOT_FOUND)
    return doc
  },

  async create(workspaceId: string, userId: string, input: CreateFinancialDocumentInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId:           input.projectId,
      clientId:            input.clientId,
      supplierId:          input.supplierId,
      financialCategoryId: input.categoryId,
      costCenterId:        input.costCenterId,
    })
    await assertCategoryDirection(input.categoryId, workspaceId, input.direction)

    return financialDocumentRepository.createWithInstallments({
      workspaceId,
      direction:       input.direction,
      projectId:       input.projectId,
      clientId:        input.clientId,
      supplierId:      input.supplierId,
      categoryId:      input.categoryId,
      costCenterId:    input.costCenterId,
      description:     input.description,
      competencyDate:  input.competencyDate,
      notes:           input.notes,
      createdByUserId: userId,
      installments:    input.installments.map((i) => ({ amountCents: reaisToCents(i.amount), dueDate: i.dueDate })),
    })
  },

  async update(id: string, workspaceId: string, input: UpdateFinancialDocumentInput) {
    const doc = await this.getById(id, workspaceId)
    if (doc.isCancelled) throw new AppError(ErrorCode.FINANCIAL_DOCUMENT_CANCELLED)

    if (input.categoryId) {
      await assertWorkspaceReferences(workspaceId, { financialCategoryId: input.categoryId })
      await assertCategoryDirection(input.categoryId, workspaceId, doc.direction)
    }
    if (input.costCenterId) {
      await assertWorkspaceReferences(workspaceId, { costCenterId: input.costCenterId })
    }

    await financialDocumentRepository.update(id, workspaceId, input)
    return this.getById(id, workspaceId)
  },

  // Soft-cancel only — same append-only spirit as Payment. A cancelled
  // document's installments stay in place (audit trail) but are excluded
  // from lists/KPIs by default (financialDocumentRepository.findMany,
  // installmentRepository.findMany both filter isCancelled: false). Blocked
  // once any payment exists — see cancelIfNoPayments's comment for the
  // RC-3.1 concurrency guarantees on this check. The repository logs the
  // audit event itself (it has the transaction outcome and correlationId
  // in scope); this layer only translates "had payments" into the HTTP-
  // facing error.
  async cancel(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    const result = await financialDocumentRepository.cancelIfNoPayments(id, workspaceId)
    if (result.hadPayments) throw new AppError(ErrorCode.FINANCIAL_DOCUMENT_HAS_PAYMENTS)
  },

  // RC-2.3 — referential guards for project.service.ts/client.service.ts,
  // which predate this module and have no built-in awareness of it. A
  // one-way, read-only dependency from "the thing being deleted" onto the
  // module that might reference it — not a shared business-logic coupling.
  hasDocumentsForProject(projectId: string, workspaceId: string) {
    return financialDocumentRepository.existsForProject(projectId, workspaceId)
  },

  hasDocumentsForClient(clientId: string, workspaceId: string) {
    return financialDocumentRepository.existsForClient(clientId, workspaceId)
  },
}
