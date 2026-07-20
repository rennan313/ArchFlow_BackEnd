import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opportunity: { updateMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { opportunityRepository } from "@/repositories/opportunity.repository"

const opportunity = vi.mocked(prisma.opportunity)

// Kanban Sprint — Fase A (MEL-04): optimistic concurrency via expectedUpdatedAt.
describe("opportunityRepository.update — optimistic concurrency (MEL-04)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("omits updatedAt from the where clause when expectedUpdatedAt is not supplied (unconditional update, backward compatible)", async () => {
    opportunity.updateMany.mockResolvedValue({ count: 1 })
    await opportunityRepository.update("opp-1", "ws-1", { stage: "LEAD" })
    expect(opportunity.updateMany).toHaveBeenCalledWith({
      where: { id: "opp-1", workspaceId: "ws-1" },
      data:  { stage: "LEAD" },
    })
  })

  it("adds updatedAt to the where clause when expectedUpdatedAt is supplied (CAS)", async () => {
    const token = new Date("2026-01-01T00:00:00Z")
    opportunity.updateMany.mockResolvedValue({ count: 1 })
    await opportunityRepository.update("opp-1", "ws-1", { stage: "APPROVED" }, token)
    expect(opportunity.updateMany).toHaveBeenCalledWith({
      where: { id: "opp-1", workspaceId: "ws-1", updatedAt: token },
      data:  { stage: "APPROVED" },
    })
  })

  it("still scopes by workspaceId even with a CAS token — never lets the token alone widen the match", async () => {
    const token = new Date("2026-01-01T00:00:00Z")
    opportunity.updateMany.mockResolvedValue({ count: 0 })
    await opportunityRepository.update("opp-1", "ws-A", { stage: "APPROVED" }, token)
    const callArgs = opportunity.updateMany.mock.calls[0][0]
    expect(callArgs.where).toMatchObject({ workspaceId: "ws-A" })
  })
})
