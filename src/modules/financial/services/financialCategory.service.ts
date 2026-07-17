import { prisma } from "@/lib/prisma"
import { financialCategoryRepository } from "@/repositories/financialCategory.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import type { CreateFinancialCategoryInput, UpdateFinancialCategoryInput, FinancialCategoryQueryInput } from "@/validations/financialCategory"

export const financialCategoryService = {
  list(workspaceId: string, query: FinancialCategoryQueryInput) {
    return financialCategoryRepository.findMany(workspaceId, query)
  },

  async getById(id: string, workspaceId: string) {
    const category = await financialCategoryRepository.findById(id, workspaceId)
    if (!category) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_NOT_FOUND)
    return category
  },

  async create(workspaceId: string, input: CreateFinancialCategoryInput) {
    let parent = null
    if (input.parentId) {
      parent = await financialCategoryRepository.findById(input.parentId, workspaceId)
      if (!parent) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_NOT_FOUND, "Parent category not found in this workspace")
      // A Despesas branch can never contain a Receitas child, or a DRE built
      // from this tree later would double-count — direction is fixed per
      // branch, inherited implicitly from the root.
      if (parent.direction !== input.direction) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_DIRECTION_MISMATCH)
    }

    const existing = await financialCategoryRepository.findByNameUnderParent(input.name, workspaceId, input.parentId ?? null)
    if (existing) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_NAME_TAKEN)

    return financialCategoryRepository.create({
      workspaceId,
      name:      input.name,
      direction: input.direction,
      parentId:  input.parentId,
    })
  },

  async update(id: string, workspaceId: string, input: UpdateFinancialCategoryInput) {
    const category = await this.getById(id, workspaceId)

    if (input.name) {
      const existing = await financialCategoryRepository.findByNameUnderParent(input.name, workspaceId, category.parentId)
      if (existing && existing.id !== id) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_NAME_TAKEN)
    }

    await financialCategoryRepository.update(id, workspaceId, input)
    return this.getById(id, workspaceId)
  },

  // No physical delete — same reasoning as every other reference-data entity
  // in this domain. Archiving is blocked while active subcategories exist
  // (an archived parent with live children would orphan them from the tree
  // in the category picker), matching how the brief treats structural
  // taxonomy edits as more guarded than everyday CRUD.
  async archive(id: string, workspaceId: string, userId: string) {
    await this.getById(id, workspaceId)
    await entityLifecycleService.archive({
      entity: "FinancialCategory", id, workspaceId, userId,
      delegate: prisma.financialCategory,
      guard: async () => {
        const childCount = await financialCategoryRepository.countChildren(id, workspaceId)
        if (childCount > 0) throw new AppError(ErrorCode.FINANCIAL_CATEGORY_HAS_CHILDREN)
      },
    })
  },

  // ADR-020 — restoring a subcategory while its parent is still archived
  // would put it back in the tree with no reachable ancestor in the
  // category picker; restore the parent first (PARENT_ARCHIVED).
  async restore(id: string, workspaceId: string, userId: string) {
    const category = await this.getById(id, workspaceId)
    await entityLifecycleService.restore({
      entity: "FinancialCategory", id, workspaceId, userId,
      delegate: prisma.financialCategory,
      integrityCheck: async () => {
        if (!category.parentId) return
        const parent = await financialCategoryRepository.findById(category.parentId, workspaceId)
        if (parent?.archived) throw new AppError(ErrorCode.PARENT_ARCHIVED)
      },
    })
    return this.getById(id, workspaceId)
  },
}
