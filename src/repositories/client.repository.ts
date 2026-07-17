import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ClientQueryInput } from "@/validations/client"

// Accepts either the global `prisma` singleton or a transaction client
// (`prisma.$transaction(async (tx) => ...)`), so find-or-create logic can
// run either standalone or as part of a larger atomic transaction.
type Db = typeof prisma | PrismaTransactionClient

export const clientRepository = {
  findById(id: string, workspaceId: string, db: Db = prisma) {
    return db.client.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { proposals: true, meetings: true } } },
    })
  },

  /** Case-insensitive exact name match within a workspace — used to reuse an
   *  existing client instead of creating a duplicate. */
  findByExactName(workspaceId: string, name: string, db: Db = prisma) {
    return db.client.findFirst({
      where: { workspaceId, name: { equals: name, mode: "insensitive" } },
    })
  },

  async findMany(workspaceId: string, query: ClientQueryInput) {
    const { page, limit, search, status, state, sortBy, sortOrder, archived } = query
    const skip = (page - 1) * limit

    const where: Prisma.ClientWhereInput = {
      workspaceId,
      archived: archived ?? false,
      ...(status && { status }),
      ...(state  && { state }),
      ...(search && {
        OR: [
          { name:    { contains: search, mode: "insensitive" } },
          { email:   { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
          { city:    { contains: search, mode: "insensitive" } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take:      limit,
        orderBy:   { [sortBy]: sortOrder },
        include:   { _count: { select: { proposals: true, meetings: true } } },
      }),
      prisma.client.count({ where }),
    ])
    return { data, total }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.ClientUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
    db: Db = prisma,
  ) {
    return db.client.create({
      data: { ...data, userId, workspaceId },
      include: { _count: { select: { proposals: true, meetings: true } } },
    })
  },

  update(id: string, workspaceId: string, data: Prisma.ClientUpdateInput) {
    return prisma.client.updateMany({ where: { id, workspaceId }, data })
  },

  findProposals(clientId: string, workspaceId: string) {
    return prisma.proposal.findMany({
      where:   { clientId, workspaceId, archived: false },
      orderBy: { createdAt: "desc" },
    })
  },
}
