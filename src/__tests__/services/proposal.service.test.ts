import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/proposal.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/services/client.service")
vi.mock("@/lib/pagination")
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// CORE-6 (Sprint 0) — proposalService.create runs inside prisma.$transaction
// (now wrapped in withTransactionRetry); this mock was entirely missing
// before Sprint 0 (the file relied on the unrelated global @/lib/prisma
// mock in setup.ts, which has no $transaction), which is why "delegates to
// repository..." below was failing regardless of the retry-wrapping change.
vi.mock("@/lib/prisma", () => {
  const mock = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)) }
  return { prisma: mock }
})

import { proposalService } from "@/services/proposal.service"
import { proposalRepository } from "@/repositories/proposal.repository"
import { projectRepository } from "@/repositories/project.repository"
import { clientService } from "@/services/client.service"
import { prisma } from "@/lib/prisma"
import { buildMeta } from "@/lib/pagination"

const mockPrisma = prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }

const mockProposal = {
  id:            "prop-1",
  userId:        "user-1",
  clientName:    "João da Silva",
  projectType:   "Residencial",
  city:          "São Paulo",
  squareMeters:  250,
  style:         "Contemporâneo",
  scope:         "",
  generatedText: null,
  status:        "DRAFT" as const,
  createdAt:     new Date(),
  updatedAt:     new Date(),
}

// ── proposalService.getById ───────────────────────────────────────────────────

describe("proposalService.getById", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns proposal when found", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(mockProposal as never)

    const result = await proposalService.getById("prop-1", "workspace-1")

    expect(result).toMatchObject({ id: "prop-1", clientName: "João da Silva" })
  })

  it("throws NOT_FOUND when proposal does not exist", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null)

    await expect(proposalService.getById("nonexistent", "workspace-1"))
      .rejects.toThrow("NOT_FOUND")
  })

  it("throws NOT_FOUND when proposal belongs to a different workspace", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null) // repo scopes by workspaceId

    await expect(proposalService.getById("prop-1", "other-workspace"))
      .rejects.toThrow("NOT_FOUND")
  })
})

// ── proposalService.create ────────────────────────────────────────────────────

describe("proposalService.create", () => {
  beforeEach(() => vi.clearAllMocks())

  const input = {
    clientName: "Test Client",
    projectType: "Comercial",
    city: "Curitiba",
    style: "Moderno",
    scope: "",
  }

  it("delegates to repository with correct user and workspace connect", async () => {
    vi.mocked(clientService.findOrCreate).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(proposalRepository.create).mockResolvedValue(mockProposal as never)

    await proposalService.create("workspace-1", "user-1", input as never)

    expect(proposalRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client:    { connect: { id: "client-1" } },
        user:      { connect: { id: "user-1" } },
        workspace: { connect: { id: "workspace-1" } },
      }),
      expect.anything(),
    )
  })

  // CORE-6 — regression test for the retry wrapping itself, same guarantee
  // as every other financial/workspace write (ADR-003).
  it("retries once on a transient transaction conflict and succeeds", async () => {
    vi.mocked(clientService.findOrCreate).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(proposalRepository.create).mockResolvedValue(mockProposal as never)

    const { Prisma } = await import("@prisma/client")
    const transientError = new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock. Please retry your transaction", { code: "P2034", clientVersion: "test" })
    mockPrisma.$transaction
      .mockImplementationOnce(() => { throw transientError })
      .mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(mockPrisma))

    const result = await proposalService.create("workspace-1", "user-1", input as never)

    expect(result).toEqual(mockProposal)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
  })
})

// ── proposalService.update ────────────────────────────────────────────────────

describe("proposalService.update", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws NOT_FOUND when proposal does not exist", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null)

    await expect(proposalService.update("nonexistent", "workspace-1", { clientName: "New Name" } as never))
      .rejects.toThrow("NOT_FOUND")
  })

  it("updates and returns refreshed proposal", async () => {
    const updated = { ...mockProposal, clientName: "Updated Client" }
    vi.mocked(proposalRepository.findById)
      .mockResolvedValueOnce(mockProposal as never) // exists check
      .mockResolvedValueOnce(updated as never)       // refetch after update
    vi.mocked(proposalRepository.update).mockResolvedValue(undefined as never)

    const result = await proposalService.update("prop-1", "workspace-1", { clientName: "Updated Client" } as never)

    expect(result?.clientName).toBe("Updated Client")
    expect(proposalRepository.update).toHaveBeenCalledWith("prop-1", "workspace-1", { clientName: "Updated Client" })
  })
})

// ── proposalService.delete ────────────────────────────────────────────────────

describe("proposalService.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws NOT_FOUND when proposal does not exist", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null)

    await expect(proposalService.delete("nonexistent", "workspace-1"))
      .rejects.toThrow("NOT_FOUND")
  })

  it("deletes when found and no Project was ever created from this proposal", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(mockProposal as never)
    vi.mocked(projectRepository.findByProposalId).mockResolvedValue(null)
    vi.mocked(proposalRepository.delete).mockResolvedValue(undefined as never)

    await proposalService.delete("prop-1", "workspace-1")

    expect(proposalRepository.delete).toHaveBeenCalledWith("prop-1", "workspace-1")
  })

  // CORE-2 (Sprint 0) — referential guard mirroring RC-2.3's Project/Client
  // pattern, one hop upstream: a Proposal that already converted to a
  // Project can no longer be deleted physically.
  it("blocks deletion with PROPOSAL_HAS_PROJECT when a Project already exists for this proposal", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(mockProposal as never)
    vi.mocked(projectRepository.findByProposalId).mockResolvedValue({ id: "proj-existing" } as never)

    await expect(proposalService.delete("prop-1", "workspace-1")).rejects.toMatchObject({
      code: ErrorCode.PROPOSAL_HAS_PROJECT,
    })
    expect(proposalRepository.delete).not.toHaveBeenCalled()
  })
})

// ── proposalService.list ──────────────────────────────────────────────────────

describe("proposalService.list", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns paginated data", async () => {
    vi.mocked(proposalRepository.findMany).mockResolvedValue({ data: [mockProposal] as never, total: 1 })
    vi.mocked(buildMeta).mockReturnValue({ total: 1, page: 1, limit: 20, totalPages: 1 })

    const result = await proposalService.list("workspace-1", { page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" })

    expect(result.data).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
  })
})
