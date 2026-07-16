import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { FinancialCategoryQueryInput } from "@/validations/financialCategory"

export const financialCategoryRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.financialCategory.findFirst({ where: { id, workspaceId } })
  },

  findByNameUnderParent(name: string, workspaceId: string, parentId: string | null) {
    return prisma.financialCategory.findFirst({
      where: { workspaceId, parentId, name: { equals: name, mode: "insensitive" } },
    })
  },

  findMany(workspaceId: string, query: FinancialCategoryQueryInput) {
    const where: Prisma.FinancialCategoryWhereInput = {
      workspaceId,
      ...(query.direction && { direction: query.direction }),
      ...(query.includeArchived ? {} : { isArchived: false }),
    }
    return prisma.financialCategory.findMany({ where, orderBy: { name: "asc" } })
  },

  create(data: Prisma.FinancialCategoryUncheckedCreateInput) {
    return prisma.financialCategory.create({ data })
  },

  update(id: string, workspaceId: string, data: Prisma.FinancialCategoryUpdateInput) {
    return prisma.financialCategory.updateMany({ where: { id, workspaceId }, data })
  },

  // RC-3.7 — workspaceId included even though every caller already resolved
  // parentId through a workspace-scoped findById first (defense in depth,
  // not a fix for an active leak): every other query in this repository
  // scopes by workspaceId directly rather than trusting a caller's prior
  // check, and this one shouldn't be the exception.
  countChildren(parentId: string, workspaceId: string) {
    return prisma.financialCategory.count({ where: { parentId, workspaceId, isArchived: false } })
  },
}
