import { describe, it, expect, vi, beforeEach } from "vitest"

// CORE-3 (Sprint 0) — Briefing has no workspaceId field either; scoped
// through the owning Opportunity. upsert() can't embed a relation filter
// in Prisma's unique `where` (same constraint as document.repository.ts's
// addVersion), so it pre-checks the parent Opportunity's workspace instead
// — that pre-check is the actual new behavior worth testing here.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    briefing: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    opportunity: { findFirst: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { briefingRepository } from "@/repositories/briefing.repository"

const briefing = vi.mocked(prisma.briefing)
const opportunity = vi.mocked(prisma.opportunity)

describe("briefingRepository — Workspace First (CORE-3)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("findByOpportunity scopes through the owning Opportunity's workspaceId", async () => {
    briefing.findFirst.mockResolvedValue(null)
    await briefingRepository.findByOpportunity("opp-1", "ws-1")
    expect(briefing.findFirst).toHaveBeenCalledWith({ where: { opportunityId: "opp-1", opportunity: { workspaceId: "ws-1" } } })
  })

  it("upsert pre-checks the parent Opportunity belongs to the workspace before writing", async () => {
    opportunity.findFirst.mockResolvedValue({ id: "opp-1" } as never)
    briefing.upsert.mockResolvedValue({ id: "briefing-1", opportunityId: "opp-1" } as never)

    const result = await briefingRepository.upsert("opp-1", "ws-1", { projectObjective: "x" })

    expect(opportunity.findFirst).toHaveBeenCalledWith({ where: { id: "opp-1", workspaceId: "ws-1" }, select: { id: true } })
    expect(briefing.upsert).toHaveBeenCalled()
    expect(result).toMatchObject({ id: "briefing-1" })
  })

  // The actual defense-in-depth guarantee: even if a caller somehow got
  // this far with a cross-tenant opportunityId, the repository's own check
  // refuses to write rather than trusting the caller.
  it("upsert returns null and never writes when the Opportunity doesn't belong to the workspace", async () => {
    opportunity.findFirst.mockResolvedValue(null)

    const result = await briefingRepository.upsert("opp-other-tenant", "ws-1", { projectObjective: "x" })

    expect(result).toBeNull()
    expect(briefing.upsert).not.toHaveBeenCalled()
  })

  it("delete scopes through the owning Opportunity's workspaceId", async () => {
    briefing.deleteMany.mockResolvedValue({ count: 1 })
    await briefingRepository.delete("opp-1", "ws-1")
    expect(briefing.deleteMany).toHaveBeenCalledWith({ where: { opportunityId: "opp-1", opportunity: { workspaceId: "ws-1" } } })
  })
})
