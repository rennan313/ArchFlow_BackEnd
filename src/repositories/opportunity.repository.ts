import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { OpportunityQueryInput } from "@/validations/opportunity"
import { toSkip } from "@/lib/pagination"

const INCLUDE_RELATIONS = {
  client:  { select: { id: true, name: true, email: true, city: true, state: true } },
  briefing: true,
  // Most recent linked proposal only — used by the Kanban Comercial card as a
  // secondary sub-status badge, not as a separate board entity (see Fase 4 plan).
  proposals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, createdAt: true } },
} as const

export const opportunityRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.opportunity.findFirst({ where: { id, workspaceId }, include: INCLUDE_RELATIONS })
  },

  async findMany(workspaceId: string, query: OpportunityQueryInput) {
    const { page, limit, search, stage, clientId, sortBy, sortOrder, archived } = query
    const skip = toSkip(page, limit)

    const where: Prisma.OpportunityWhereInput = {
      workspaceId,
      archived: archived ?? false,
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

  // NOTE: this previously filtered by { id } only — no userId/workspaceId —
  // a confirmed cross-tenant IDOR (any authenticated caller could update any
  // workspace's opportunity by id). Now scoped like every other write here.
  //
  // Kanban Sprint — Fase A (MEL-04): expectedUpdatedAt, when supplied, adds
  // an optimistic-concurrency guard to the where clause — the updateMany
  // matches (and updates) 0 rows if someone else wrote to this record after
  // the caller last read it, instead of silently overwriting their change.
  // The caller (opportunity.service.ts) checks result.count to detect this.
  update(id: string, workspaceId: string, data: Prisma.OpportunityUpdateInput, expectedUpdatedAt?: Date) {
    return prisma.opportunity.updateMany({
      where: { id, workspaceId, ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}) },
      data,
    })
  },

  // Pipeline aggregations
  async pipelineStats(workspaceId: string) {
    return prisma.opportunity.groupBy({
      by:    ["stage"],
      where: { workspaceId, archived: false },
      _count: { _all: true },
      _sum:   { estimatedRevenue: true },
    })
  },
}
