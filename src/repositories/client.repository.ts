import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ClientQueryInput } from "@/validations/client"

export const clientRepository = {
  findById(id: string, userId: string) {
    return prisma.client.findFirst({ where: { id, userId } })
  },

  async findMany(userId: string, query: ClientQueryInput) {
    const { page, limit, search, state, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.ClientWhereInput = {
      userId,
      ...(state  && { state }),
      ...(search && {
        OR: [
          { name:  { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { city:  { contains: search, mode: "insensitive" } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.client.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
      prisma.client.count({ where }),
    ])
    return { data, total }
  },

  create(userId: string, data: Prisma.ClientCreateInput) {
    return prisma.client.create({ data: { ...data, user: { connect: { id: userId } } } })
  },

  update(id: string, userId: string, data: Prisma.ClientUpdateInput) {
    return prisma.client.updateMany({ where: { id, userId }, data })
  },

  delete(id: string, userId: string) {
    return prisma.client.deleteMany({ where: { id, userId } })
  },
}
