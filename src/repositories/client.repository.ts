import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ClientQueryInput } from "@/validations/client"

export const clientRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.client.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { proposals: true, meetings: true } } },
    })
  },

  async findMany(workspaceId: string, query: ClientQueryInput) {
    const { page, limit, search, status, state, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.ClientWhereInput = {
      workspaceId,
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
  ) {
    return prisma.client.create({
      data: { ...data, userId, workspaceId },
      include: { _count: { select: { proposals: true, meetings: true } } },
    })
  },

  update(id: string, workspaceId: string, data: Prisma.ClientUpdateInput) {
    return prisma.client.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.client.deleteMany({ where: { id, workspaceId } })
  },

  findProposals(clientId: string, workspaceId: string) {
    return prisma.proposal.findMany({
      where:   { clientId, workspaceId },
      orderBy: { createdAt: "desc" },
    })
  },
}
