import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/proposal.repository")
vi.mock("@/lib/pagination")

import { proposalService } from "@/services/proposal.service"
import { proposalRepository } from "@/repositories/proposal.repository"
import { buildMeta } from "@/lib/pagination"

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

    const result = await proposalService.getById("prop-1", "user-1")

    expect(result).toMatchObject({ id: "prop-1", clientName: "João da Silva" })
  })

  it("throws NOT_FOUND when proposal does not exist", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null)

    await expect(proposalService.getById("nonexistent", "user-1"))
      .rejects.toThrow("NOT_FOUND")
  })

  it("throws NOT_FOUND when proposal belongs to different user", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null) // repo scopes by userId

    await expect(proposalService.getById("prop-1", "other-user"))
      .rejects.toThrow("NOT_FOUND")
  })
})

// ── proposalService.create ────────────────────────────────────────────────────

describe("proposalService.create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("delegates to repository with correct user connect", async () => {
    vi.mocked(proposalRepository.create).mockResolvedValue(mockProposal as never)

    const input = {
      clientName: "Test Client",
      projectType: "Comercial",
      city: "Curitiba",
      style: "Moderno",
      scope: "",
    }

    await proposalService.create("user-1", input as never)

    expect(proposalRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ user: { connect: { id: "user-1" } } })
    )
  })
})

// ── proposalService.update ────────────────────────────────────────────────────

describe("proposalService.update", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws NOT_FOUND when proposal does not exist", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null)

    await expect(proposalService.update("nonexistent", "user-1", { clientName: "New Name" } as never))
      .rejects.toThrow("NOT_FOUND")
  })

  it("updates and returns refreshed proposal", async () => {
    const updated = { ...mockProposal, clientName: "Updated Client" }
    vi.mocked(proposalRepository.findById)
      .mockResolvedValueOnce(mockProposal as never) // exists check
      .mockResolvedValueOnce(updated as never)       // refetch after update
    vi.mocked(proposalRepository.update).mockResolvedValue(undefined as never)

    const result = await proposalService.update("prop-1", "user-1", { clientName: "Updated Client" } as never)

    expect(result?.clientName).toBe("Updated Client")
    expect(proposalRepository.update).toHaveBeenCalledWith("prop-1", "user-1", { clientName: "Updated Client" })
  })
})

// ── proposalService.delete ────────────────────────────────────────────────────

describe("proposalService.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws NOT_FOUND when proposal does not exist", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null)

    await expect(proposalService.delete("nonexistent", "user-1"))
      .rejects.toThrow("NOT_FOUND")
  })

  it("deletes when found", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(mockProposal as never)
    vi.mocked(proposalRepository.delete).mockResolvedValue(undefined as never)

    await proposalService.delete("prop-1", "user-1")

    expect(proposalRepository.delete).toHaveBeenCalledWith("prop-1", "user-1")
  })
})

// ── proposalService.list ──────────────────────────────────────────────────────

describe("proposalService.list", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns paginated data", async () => {
    vi.mocked(proposalRepository.findMany).mockResolvedValue({ data: [mockProposal] as never, total: 1 })
    vi.mocked(buildMeta).mockReturnValue({ total: 1, page: 1, limit: 20, totalPages: 1 })

    const result = await proposalService.list("user-1", { page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" })

    expect(result.data).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
  })
})
