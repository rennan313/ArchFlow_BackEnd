import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ActivityCategoryQueryInput } from "@/validations/activityCategory"

export const activityCategoryRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.activityCategory.findFirst({ where: { id, workspaceId } })
  },

  findByName(name: string, workspaceId: string) {
    return prisma.activityCategory.findFirst({
      where: { workspaceId, name: { equals: name, mode: "insensitive" } },
    })
  },

  findMany(workspaceId: string, query: ActivityCategoryQueryInput) {
    return prisma.activityCategory.findMany({
      where: { workspaceId, archived: query.archived ?? false },
      orderBy: { name: "asc" },
    })
  },

  create(data: Prisma.ActivityCategoryUncheckedCreateInput) {
    return prisma.activityCategory.create({ data })
  },

  update(id: string, workspaceId: string, data: Prisma.ActivityCategoryUpdateInput) {
    return prisma.activityCategory.updateMany({ where: { id, workspaceId }, data })
  },
}
