import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const costCenterRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.costCenter.findFirst({ where: { id, workspaceId } })
  },

  findByName(name: string, workspaceId: string) {
    return prisma.costCenter.findFirst({ where: { workspaceId, name: { equals: name, mode: "insensitive" } } })
  },

  findMany(workspaceId: string, includeArchived: boolean) {
    return prisma.costCenter.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: { name: "asc" },
    })
  },

  create(data: Prisma.CostCenterUncheckedCreateInput) {
    return prisma.costCenter.create({ data })
  },

  update(id: string, workspaceId: string, data: Prisma.CostCenterUpdateInput) {
    return prisma.costCenter.updateMany({ where: { id, workspaceId }, data })
  },
}
