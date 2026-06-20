import { prisma } from "@/lib/prisma"
import { followUpRepository } from "@/repositories/followup.repository"

import type { OpportunityStage } from "@prisma/client"

const ACTIVE_STAGES: OpportunityStage[] = ["LEAD", "BRIEFING", "PROPOSAL_DRAFT", "PROPOSAL_SENT", "NEGOTIATION"]

export const dashboardService = {
  async getAggregations(workspaceId: string) {
    const [
      stageGroups,
      approvedCount,
      lostCount,
      approvedRevenue,
      overdue,
      recentProposals,
    ] = await Promise.all([
      // Pipeline by stage (active only)
      prisma.opportunity.groupBy({
        by:    ["stage"],
        where: { workspaceId, stage: { in: ACTIVE_STAGES } },
        _count: { _all: true },
        _sum:   { estimatedRevenue: true },
      }),
      // Approved count (for rate)
      prisma.opportunity.count({ where: { workspaceId, stage: "APPROVED" } }),
      // Lost count (for rate)
      prisma.opportunity.count({ where: { workspaceId, stage: "LOST" } }),
      // Approved revenue
      prisma.opportunity.aggregate({
        where: { workspaceId, stage: "APPROVED" },
        _sum:  { estimatedRevenue: true },
        _avg:  { estimatedRevenue: true },
      }),
      // Overdue follow-ups
      followUpRepository.findOverdue(workspaceId),
      // Recent proposals
      prisma.proposal.findMany({
        where:   { workspaceId },
        orderBy: { createdAt: "desc" },
        take:    5,
        select:  { id: true, clientName: true, status: true, estimatedTotal: true, createdAt: true },
      }),
    ])

    // Compute pipeline totals
    let pipelineValue    = 0
    let expectedRevenue  = 0
    let activeCount      = 0
    const byStage: Record<string, { count: number; revenue: number }> = {}

    for (const g of stageGroups) {
      const rev   = g._sum.estimatedRevenue ?? 0
      const cnt   = g._count._all
      const prob  = stageProbability(g.stage)
      pipelineValue   += rev
      expectedRevenue += rev * prob / 100
      activeCount     += cnt
      byStage[g.stage] = { count: cnt, revenue: rev }
    }

    const approvedRate = approvedCount + lostCount > 0
      ? Math.round((approvedCount / (approvedCount + lostCount)) * 100)
      : 0

    return {
      activeOpportunities:    activeCount,
      pipelineValue:          round2(pipelineValue),
      expectedRevenue:        round2(expectedRevenue),
      approvalRate:           approvedRate,
      averageApprovedRevenue: round2(approvedRevenue._avg.estimatedRevenue ?? 0),
      totalApprovedRevenue:   round2(approvedRevenue._sum.estimatedRevenue ?? 0),
      overdueFollowUps:       overdue.length,
      byStage,
      recentProposals,
      requiresAction: {
        overdueFollowUps: overdue.map((f) => ({
          id:             f.id,
          opportunityId:  f.opportunityId,
          opportunityTitle: (f as Record<string, unknown> & { opportunity?: { title?: string } }).opportunity?.title,
          clientName:     ((f as Record<string, unknown> & { opportunity?: { client?: { name?: string } } }).opportunity?.client?.name),
          nextContactDate: f.nextContactDate,
          notes:          f.notes,
        })),
      },
    }
  },
}

function stageProbability(stage: string): number {
  const map: Record<string, number> = {
    LEAD: 10, BRIEFING: 25, PROPOSAL_DRAFT: 50,
    PROPOSAL_SENT: 70, NEGOTIATION: 85, APPROVED: 100, LOST: 0,
  }
  return map[stage] ?? 0
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
