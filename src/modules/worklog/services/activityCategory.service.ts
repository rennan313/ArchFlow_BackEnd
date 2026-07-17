import { prisma } from "@/lib/prisma"
import { activityCategoryRepository } from "@/repositories/activityCategory.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import type { CreateActivityCategoryInput, UpdateActivityCategoryInput, ActivityCategoryQueryInput } from "@/validations/activityCategory"

export const activityCategoryService = {
  list(workspaceId: string, query: ActivityCategoryQueryInput) {
    return activityCategoryRepository.findMany(workspaceId, query)
  },

  async getById(id: string, workspaceId: string) {
    const category = await activityCategoryRepository.findById(id, workspaceId)
    if (!category) throw new AppError(ErrorCode.ACTIVITY_CATEGORY_NOT_FOUND)
    return category
  },

  async create(workspaceId: string, input: CreateActivityCategoryInput) {
    const existing = await activityCategoryRepository.findByName(input.name, workspaceId)
    if (existing) throw new AppError(ErrorCode.ACTIVITY_CATEGORY_NAME_TAKEN)

    return activityCategoryRepository.create({ workspaceId, name: input.name, isDefault: false })
  },

  async update(id: string, workspaceId: string, input: UpdateActivityCategoryInput) {
    await this.getById(id, workspaceId)

    if (input.name) {
      const existing = await activityCategoryRepository.findByName(input.name, workspaceId)
      if (existing && existing.id !== id) throw new AppError(ErrorCode.ACTIVITY_CATEGORY_NAME_TAKEN)
    }

    await activityCategoryRepository.update(id, workspaceId, input)
    return this.getById(id, workspaceId)
  },

  async archive(id: string, workspaceId: string, userId: string) {
    await this.getById(id, workspaceId)
    // No "has children" guard (unlike FinancialCategory) — ActivityCategory
    // has no hierarchy in this phase. Archiving a category never invalidates
    // TimeEntry rows already tagged with it — same loose-reference reasoning
    // as SupplierCategory→Supplier (DOMAIN_GUIDE.md §2.4).
    await entityLifecycleService.archive({
      entity: "ActivityCategory", id, workspaceId, userId,
      delegate: prisma.activityCategory,
    })
  },

  async restore(id: string, workspaceId: string, userId: string) {
    await entityLifecycleService.restore({
      entity: "ActivityCategory", id, workspaceId, userId,
      delegate: prisma.activityCategory,
    })
    return this.getById(id, workspaceId)
  },
}
