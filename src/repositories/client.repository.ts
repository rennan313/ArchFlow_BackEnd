import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ClientQueryInput } from "@/validations/client"

export const clientRepository = {
  findById(id: string, userId: string) {
    return prisma.client.findFirst({
      where: { id, userId },
      include: { _count: { select: { proposals: true } } },
    })
  },

  async findMany(userId: string, query: ClientQueryInput) {
    const { page, limit, search, status, state, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.ClientWhereInput = {
      userId,
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
        include:   { _count: { select: { proposals: true } } },
      }),
      prisma.client.count({ where }),
    ])
    return { data, total }
  },

  create(userId: string, data: Omit<Prisma.ClientUncheckedCreateInput, "id" | "userId" | "createdAt" | "updatedAt">) {
    return prisma.client.create({
      data: { ...data, userId },
      include: { _count: { select: { proposals: true } } },
    })
  },

  update(id: string, userId: string, data: Prisma.ClientUpdateInput) {
    return prisma.client.updateMany({ where: { id, userId }, data })
  },

  delete(id: string, userId: string) {
    return prisma.client.deleteMany({ where: { id, userId } })
  },

  findProposals(clientId: string, userId: string) {
    return prisma.proposal.findMany({
      where:   { clientId, userId },
      orderBy: { createdAt: "desc" },
    })
  },
}
