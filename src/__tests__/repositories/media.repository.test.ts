import { describe, it, expect, vi, beforeEach } from "vitest"

// CORE-3 (Sprint 0) — ProposalMedia has no workspaceId field of its own, so
// the actual behavior worth testing is that every read/updateMany/deleteMany
// now filters through the `proposal: { workspaceId }` relation, not just
// `proposalId`. Not testing every CRUD method exhaustively (create/simple
// passthroughs add no value) — only the workspace-scoping behavior that
// changed.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    proposalMedia: {
      findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}))

import { prisma } from "@/lib/prisma"
import { mediaRepository } from "@/repositories/media.repository"

const mocked = vi.mocked(prisma.proposalMedia)

describe("mediaRepository — Workspace First (CORE-3)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("findAll scopes by the owning proposal's workspaceId", async () => {
    mocked.findMany.mockResolvedValue([])
    await mediaRepository.findAll("prop-1", "ws-1")
    expect(mocked.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { proposalId: "prop-1", proposal: { workspaceId: "ws-1" } },
    }))
  })

  it("findById scopes by the owning proposal's workspaceId", async () => {
    mocked.findFirst.mockResolvedValue(null)
    await mediaRepository.findById("media-1", "prop-1", "ws-1")
    expect(mocked.findFirst).toHaveBeenCalledWith({
      where: { id: "media-1", proposalId: "prop-1", proposal: { workspaceId: "ws-1" } },
    })
  })

  it("update scopes the updateMany by workspaceId — a media id from another workspace matches nothing", async () => {
    mocked.updateMany.mockResolvedValue({ count: 0 })
    await mediaRepository.update("media-1", "prop-1", "ws-1", { title: "New title" })
    expect(mocked.updateMany).toHaveBeenCalledWith({
      where: { id: "media-1", proposalId: "prop-1", proposal: { workspaceId: "ws-1" } },
      data: { title: "New title" },
    })
  })

  it("delete scopes the deleteMany by workspaceId", async () => {
    mocked.deleteMany.mockResolvedValue({ count: 1 })
    await mediaRepository.delete("media-1", "prop-1", "ws-1")
    expect(mocked.deleteMany).toHaveBeenCalledWith({
      where: { id: "media-1", proposalId: "prop-1", proposal: { workspaceId: "ws-1" } },
    })
  })

  it("countByProposal scopes by workspaceId", async () => {
    mocked.count.mockResolvedValue(3)
    await mediaRepository.countByProposal("prop-1", "ws-1")
    expect(mocked.count).toHaveBeenCalledWith({ where: { proposalId: "prop-1", proposal: { workspaceId: "ws-1" } } })
  })

  it("reorder scopes every updateMany in the batch by workspaceId", async () => {
    mocked.updateMany.mockResolvedValue({ count: 1 })
    await mediaRepository.reorder("prop-1", "ws-1", [{ mediaId: "m1", order: 0 }, { mediaId: "m2", order: 1 }])
    expect(mocked.updateMany).toHaveBeenCalledWith({ where: { id: "m1", proposalId: "prop-1", proposal: { workspaceId: "ws-1" } }, data: { order: 0 } })
    expect(mocked.updateMany).toHaveBeenCalledWith({ where: { id: "m2", proposalId: "prop-1", proposal: { workspaceId: "ws-1" } }, data: { order: 1 } })
  })
})
