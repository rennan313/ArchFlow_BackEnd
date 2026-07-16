import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { SupplierCategoryQueryInput } from "@/validations/supplierCategory"

export const supplierCategoryRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.supplierCategory.findFirst({ where: { id, workspaceId } })
  },

  findByName(name: string, workspaceId: string) {
    return prisma.supplierCategory.findFirst({ where: { workspaceId, name: { equals: name, mode: "insensitive" } } })
  },

  findMany(workspaceId: string, query: SupplierCategoryQueryInput) {
    const where: Prisma.SupplierCategoryWhereInput = {
      workspaceId,
      ...(query.includeArchived ? {} : { isArchived: false }),
    }
    return prisma.supplierCategory.findMany({ where, orderBy: { name: "asc" } })
  },

  create(data: Prisma.SupplierCategoryUncheckedCreateInput) {
    return prisma.supplierCategory.create({ data })
  },

  update(id: string, workspaceId: string, data: Prisma.SupplierCategoryUpdateInput) {
    return prisma.supplierCategory.updateMany({ where: { id, workspaceId }, data })
  },
}
