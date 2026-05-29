import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { OpportunityQueryInput } from "@/validations/opportunity"

const INCLUDE_RELATIONS = {
  client:  { select: { id: true, name: true, email: true, city: true, state: true } },
  briefing: true,
} as const

export const opportunityRepository = {
  findById(id: string, userId: string) {
    return prisma.opportunity.findFirst({ where: { id, userId }, include: INCLUDE_RELATIONS })
  },

  async findMany(userId: string, query: OpportunityQueryInput) {
    const { page, limit, search, stage, clientId, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.OpportunityWhereInput = {
      userId,
      ...(stage    && { stage }),
      ...(clientId && { clientId }),
      ...(search   && {
        OR: [
          { title:       { contains: search, mode: "insensitive" } },
          { projectType: { contains: search, mode: "insensitive" } },
          { city:        { contains: search, mode: "insensitive" } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: INCLUDE_RELATIONS,
      }),
      prisma.opportunity.count({ where }),
    ])
    return { data, total }
  },

  create(data: Prisma.OpportunityUncheckedCreateInput) {
    return prisma.opportunity.create({ data, include: INCLUDE_RELATIONS })
  },

  update(id: string, userId: string, data: Prisma.OpportunityUpdateInput) {
    return prisma.opportunity.update({ where: { id }, data })
  },

  delete(id: string, userId: string) {
    return prisma.opportunity.deleteMany({ where: { id, userId } })
  },

  // Pipeline aggregations
  async pipelineStats(userId: string) {
    return prisma.opportunity.groupBy({
      by:    ["stage"],
      where: { userId },
      _count: { _all: true },
      _sum:   { estimatedRevenue: true },
    })
  },
}
