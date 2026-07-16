import { supplierCategoryRepository } from "@/repositories/supplierCategory.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { CreateSupplierCategoryInput, UpdateSupplierCategoryInput, SupplierCategoryQueryInput } from "@/validations/supplierCategory"

export const supplierCategoryService = {
  list(workspaceId: string, query: SupplierCategoryQueryInput) {
    return supplierCategoryRepository.findMany(workspaceId, query)
  },

  async getById(id: string, workspaceId: string) {
    const category = await supplierCategoryRepository.findById(id, workspaceId)
    if (!category) throw new AppError(ErrorCode.SUPPLIER_CATEGORY_NOT_FOUND)
    return category
  },

  async create(workspaceId: string, input: CreateSupplierCategoryInput) {
    const existing = await supplierCategoryRepository.findByName(input.name, workspaceId)
    if (existing) throw new AppError(ErrorCode.SUPPLIER_CATEGORY_NAME_TAKEN)

    return supplierCategoryRepository.create({ workspaceId, name: input.name })
  },

  async update(id: string, workspaceId: string, input: UpdateSupplierCategoryInput) {
    await this.getById(id, workspaceId)

    if (input.name) {
      const existing = await supplierCategoryRepository.findByName(input.name, workspaceId)
      if (existing && existing.id !== id) throw new AppError(ErrorCode.SUPPLIER_CATEGORY_NAME_TAKEN)
    }

    await supplierCategoryRepository.update(id, workspaceId, input)
    return this.getById(id, workspaceId)
  },

  // No physical delete — same append-only-reference-data spirit as the rest
  // of the Financial domain (see FinancialDocument.isCancelled comment).
  // Archiving is safe even while suppliers still reference this category:
  // the picker for new suppliers just stops offering it going forward.
  async archive(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    await supplierCategoryRepository.update(id, workspaceId, { isArchived: true })
  },
}
