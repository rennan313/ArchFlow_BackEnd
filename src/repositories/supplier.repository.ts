import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { SupplierQueryInput } from "@/validations/supplier"
import { toSkip } from "@/lib/pagination"

const INCLUDE_RELATIONS = {
  category: { select: { id: true, name: true } },
} as const

export const supplierRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.supplier.findFirst({ where: { id, workspaceId }, include: INCLUDE_RELATIONS })
  },

  async findMany(workspaceId: string, query: SupplierQueryInput) {
    const { page, limit, search, categoryId, archived, sortBy, sortOrder } = query
    const skip = toSkip(page, limit)

    const where: Prisma.SupplierWhereInput = {
      workspaceId,
      ...(categoryId && { categoryId }),
      ...(archived !== undefined && { archived }),
      ...(search && {
        OR: [
          { name:     { contains: search, mode: "insensitive" } },
          { document: { contains: search, mode: "insensitive" } },
          { email:    { contains: search, mode: "insensitive" } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.supplier.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder }, include: INCLUDE_RELATIONS }),
      prisma.supplier.count({ where }),
    ])
    return { data, total }
  },

  create(data: Prisma.SupplierUncheckedCreateInput) {
    return prisma.supplier.create({ data, include: INCLUDE_RELATIONS })
  },

  update(id: string, workspaceId: string, data: Prisma.SupplierUpdateInput) {
    return prisma.supplier.updateMany({ where: { id, workspaceId }, data })
  },

  // Distinct projects a supplier has been billed against, via its
  // FinancialDocuments — feeds the Fornecedor↔Projeto N:N view from the
  // brief without a separate join table (the relationship only ever exists
  // through a financial document, so there is nothing else to store).
  // Selects the Project relation directly (not just projectId) so the
  // caller never needs a second round-trip to resolve names for display.
  async findProjects(supplierId: string, workspaceId: string) {
    const rows = await prisma.financialDocument.findMany({
      where: { supplierId, workspaceId, projectId: { not: null } },
      select: { project: { select: { id: true, name: true } } },
      distinct: ["projectId"],
    })
    return rows.map((r) => r.project).filter((p): p is { id: string; name: string } => p !== null)
  },
}
