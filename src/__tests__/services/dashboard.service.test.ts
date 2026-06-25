import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opportunity: { groupBy: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    proposal:    { findMany: vi.fn() },
  },
}))
vi.mock("@/repositories/followup.repository", () => ({
  followUpRepository: { findOverdue: vi.fn() },
}))
vi.mock("@/repositories/opportunity.repository", () => ({
  opportunityRepository: { pipelineStats: vi.fn() },
}))
vi.mock("@/services/project.service", () => ({
  projectService: { phaseStats: vi.fn() },
}))
vi.mock("@/services/automation.service", () => ({
  automationService: { getDashboardStats: vi.fn() },
}))

import { dashboardService } from "@/services/dashboard.service"
import { prisma } from "@/lib/prisma"
import { followUpRepository } from "@/repositories/followup.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { projectService } from "@/services/project.service"
import { automationService } from "@/services/automation.service"

describe("dashboardService.getAggregations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("includes FIRST_CONTACT in the active-stage pipeline filter", async () => {
    vi.mocked(prisma.opportunity.groupBy).mockResolvedValue([
      { stage: "FIRST_CONTACT", _count: { _all: 2 }, _sum: { estimatedRevenue: 30000 } },
    ] as never)
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0)
    vi.mocked(prisma.opportunity.aggregate).mockResolvedValue({ _sum: {}, _avg: {} } as never)
    vi.mocked(followUpRepository.findOverdue).mockResolvedValue([])
    vi.mocked(prisma.proposal.findMany).mockResolvedValue([])

    const result = await dashboardService.getAggregations("workspace-1")

    expect(prisma.opportunity.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stage: { in: expect.arrayContaining(["FIRST_CONTACT"]) } }) }),
    )
    expect(result.byStage.FIRST_CONTACT).toEqual({ count: 2, revenue: 30000 })
    expect(result.activeOpportunities).toBe(2)
  })
})

describe("dashboardService.getKanbanWidgets", () => {
  beforeEach(() => vi.clearAllMocks())

  it("merges commercial pipeline and projects-by-phase summaries", async () => {
    vi.mocked(opportunityRepository.pipelineStats).mockResolvedValue([
      { stage: "FIRST_CONTACT", _count: { _all: 4 }, _sum: { estimatedRevenue: 12000 } },
    ] as never)
    vi.mocked(projectService.phaseStats).mockResolvedValue({
      byPhase: { BRIEFING: 1, PRELIMINARY_DESIGN: 0, EXECUTIVE_DESIGN: 0, COMPATIBILIZATION: 0, APPROVAL: 0, DELIVERY: 0 },
      overdueCount: 3,
    } as never)
    vi.mocked(automationService.getDashboardStats).mockResolvedValue({
      executedToday: 0, projectsCreated: 0, followUpsCreated: 0, alertsGenerated: 0,
    } as never)

    const result = await dashboardService.getKanbanWidgets("workspace-1")

    expect(result.commercialPipeline.byStage.FIRST_CONTACT).toEqual({ count: 4, revenue: 12000 })
    expect(result.projectsByPhase.overdueCount).toBe(3)
  })
})
