import { describe, it, expect, vi, beforeEach } from "vitest"

// CORE-3 (Sprint 0) — ProposalStatusHistory has no workspaceId field;
// getHistory now scopes through the owning Proposal relation instead of
// trusting the caller's prior check alone.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    proposalStatusHistory: { create: vi.fn(), findMany: vi.fn() },
    proposal: { updateMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { statusRepository } from "@/repositories/status.repository"

const history = vi.mocked(prisma.proposalStatusHistory)

describe("statusRepository — Workspace First (CORE-3)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("getHistory scopes through the owning Proposal's workspaceId", async () => {
    history.findMany.mockResolvedValue([])
    await statusRepository.getHistory("prop-1", "ws-1")
    expect(history.findMany).toHaveBeenCalledWith({
      where: { proposalId: "prop-1", proposal: { workspaceId: "ws-1" } },
      orderBy: { changedAt: "desc" },
    })
  })

  it("recordHistory is not workspace-scoped itself — an insert has no existing row to filter, the caller validates the proposal's workspace first", async () => {
    history.create.mockResolvedValue({ id: "hist-1" } as never)
    await statusRepository.recordHistory("prop-1", "DRAFT", "SENT")
    expect(history.create).toHaveBeenCalledWith({ data: { proposalId: "prop-1", oldStatus: "DRAFT", newStatus: "SENT" } })
  })
})
