import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { updateMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { projectRepository } from "@/repositories/project.repository"

const project = vi.mocked(prisma.project)

// Kanban Sprint — Fase A (MEL-04): optimistic concurrency via expectedUpdatedAt.
describe("projectRepository.update — optimistic concurrency (MEL-04)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("omits updatedAt from the where clause when expectedUpdatedAt is not supplied (unconditional update, backward compatible)", async () => {
    project.updateMany.mockResolvedValue({ count: 1 })
    await projectRepository.update("proj-1", "ws-1", { phase: "BRIEFING" })
    expect(project.updateMany).toHaveBeenCalledWith({
      where: { id: "proj-1", workspaceId: "ws-1" },
      data:  { phase: "BRIEFING" },
    })
  })

  it("adds updatedAt to the where clause when expectedUpdatedAt is supplied (CAS)", async () => {
    const token = new Date("2026-01-01T00:00:00Z")
    project.updateMany.mockResolvedValue({ count: 1 })
    await projectRepository.update("proj-1", "ws-1", { phase: "DELIVERY" }, token)
    expect(project.updateMany).toHaveBeenCalledWith({
      where: { id: "proj-1", workspaceId: "ws-1", updatedAt: token },
      data:  { phase: "DELIVERY" },
    })
  })

  it("still scopes by workspaceId even with a CAS token — never lets the token alone widen the match", async () => {
    const token = new Date("2026-01-01T00:00:00Z")
    project.updateMany.mockResolvedValue({ count: 0 })
    await projectRepository.update("proj-1", "ws-A", { phase: "DELIVERY" }, token)
    const callArgs = project.updateMany.mock.calls[0][0]
    expect(callArgs.where).toMatchObject({ workspaceId: "ws-A" })
  })
})
