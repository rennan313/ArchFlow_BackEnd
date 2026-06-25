import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const followUpRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.followUp.findFirst({ where: { id, workspaceId } })
  },

  findByOpportunity(opportunityId: string, workspaceId: string) {
    return prisma.followUp.findMany({
      where:   { opportunityId, workspaceId },
      orderBy: { nextContactDate: "asc" },
    })
  },

  findPending(workspaceId: string) {
    return prisma.followUp.findMany({
      where:   { completed: false, workspaceId },
      orderBy: { nextContactDate: "asc" },
      include: {
        opportunity: { select: { id: true, title: true, stage: true, client: { select: { name: true } } } },
      },
    })
  },

  findOverdue(workspaceId: string) {
    return prisma.followUp.findMany({
      where: { completed: false, nextContactDate: { lt: new Date() }, workspaceId },
      include: {
        opportunity: { select: { id: true, title: true, client: { select: { name: true } } } },
      },
    })
  },

  /**
   * Batched form of findByProposalAutomation — one query covering every
   * candidate opportunityId/clientId instead of one query per stale proposal.
   * Returns the sets of ids that already have an automation-sourced FollowUp.
   */
  async findExistingProposalAutomationLinks(workspaceId: string, opportunityIds: string[], clientIds: string[]) {
    if (opportunityIds.length === 0 && clientIds.length === 0) {
      return { opportunityIds: new Set<string>(), clientIds: new Set<string>() }
    }
    const rows = await prisma.followUp.findMany({
      where: {
        workspaceId,
        source: "AUTOMATION",
        OR: [
          ...(opportunityIds.length ? [{ opportunityId: { in: opportunityIds } }] : []),
          ...(clientIds.length ? [{ clientId: { in: clientIds }, opportunityId: null }] : []),
        ],
      },
      select: { opportunityId: true, clientId: true },
    })
    return {
      opportunityIds: new Set(rows.filter((r) => r.opportunityId).map((r) => r.opportunityId as string)),
      clientIds: new Set(rows.filter((r) => !r.opportunityId && r.clientId).map((r) => r.clientId as string)),
    }
  },

  findByProjectAutomation(projectId: string, workspaceId: string) {
    return prisma.followUp.findFirst({ where: { projectId, workspaceId, source: "AUTOMATION" } })
  },

  create(data: Prisma.FollowUpUncheckedCreateInput) {
    return prisma.followUp.create({ data })
  },

  update(id: string, workspaceId: string, data: Prisma.FollowUpUncheckedUpdateInput) {
    return prisma.followUp.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.followUp.deleteMany({ where: { id, workspaceId } })
  },
}
