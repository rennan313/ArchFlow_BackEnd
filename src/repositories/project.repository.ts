import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ProjectQueryInput } from "@/validations/project"

const clientSelect = { select: { id: true, name: true, company: true } } as const

export const projectRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.project.findFirst({
      where:   { id, workspaceId },
      include: { client: clientSelect },
    })
  },

  /** Context bundle for ProposalAdvisorService — pulls briefing signals from
   *  whichever source the project actually has linked (a Proposal already
   *  carries its own briefing copy; an Opportunity's Briefing is the
   *  fallback for projects with no Proposal yet). Either may be absent. */
  findByIdForAdvisor(id: string, workspaceId: string) {
    return prisma.project.findFirst({
      where: { id, workspaceId },
      include: {
        client: clientSelect,
        proposal: {
          select: {
            projectObjective: true, spaceUsage: true, currentProblems: true,
            priorities: true, budget: true, timeline: true, meetingNotes: true,
            complexity: true, estimatedTotal: true, style: true,
          },
        },
        opportunity: {
          select: {
            briefing: {
              select: {
                projectObjective: true, spaceUsage: true, currentProblems: true,
                priorities: true, budget: true, timeline: true, meetingNotes: true,
                desiredStyle: true,
              },
            },
          },
        },
      },
    })
  },

  /** Idempotency guard for Automação 01 — has a project already been auto-created for this opportunity? */
  findByOpportunityId(opportunityId: string, workspaceId: string) {
    return prisma.project.findFirst({ where: { opportunityId, workspaceId } })
  },

  /** Resolves the Project behind a Proposal — ProposalAdvisorService is keyed
   *  by projectId, but the builder is keyed by proposalId, so this is the
   *  join the builder's initialize step needs. */
  findByProposalId(proposalId: string, workspaceId: string) {
    return prisma.project.findFirst({ where: { proposalId, workspaceId } })
  },

  async findMany(workspaceId: string, query: ProjectQueryInput) {
    const { page, limit, search, status, phase, type, clientId, sortBy, sortOrder, archived } = query
    const skip = (page - 1) * limit

    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      archived: archived ?? false,
      ...(status   && { status }),
      ...(phase    && { phase }),
      ...(type     && { type }),
      ...(clientId && { clientId }),
      ...(search   && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { [sortBy]: sortOrder },
        include: { client: clientSelect },
      }),
      prisma.project.count({ where }),
    ])

    return { data, total }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.ProjectUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.project.create({
      data:    { ...data, userId, workspaceId },
      include: { client: clientSelect },
    })
  },

  update(id: string, workspaceId: string, data: Prisma.ProjectUpdateInput) {
    return prisma.project.updateMany({ where: { id, workspaceId }, data })
  },

  phaseStats(workspaceId: string) {
    return prisma.project.groupBy({
      by:     ["phase"],
      where:  { workspaceId, archived: false },
      _count: { _all: true },
    })
  },

  countOverdue(workspaceId: string) {
    return prisma.project.count({
      where: { workspaceId, archived: false, estimatedEndDate: { lt: new Date() }, phase: { not: "DELIVERY" } },
    })
  },

  findOverdue(workspaceId: string) {
    return prisma.project.findMany({
      where:  { workspaceId, archived: false, estimatedEndDate: { lt: new Date() }, phase: { not: "DELIVERY" } },
      select: { id: true, name: true },
    })
  },
}
