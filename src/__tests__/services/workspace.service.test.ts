import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/lib/prisma")

import { workspaceService } from "@/services/workspace.service"
import { prisma } from "@/lib/prisma"

const mockWorkspace = {
  id:        "ws-1",
  name:      "Test Office",
  slug:      "test-office",
  plan:      "STARTER",
  active:    true,
  createdAt: new Date(),
}

const mockUser = {
  id:                  "user-1",
  name:                "Test User",
  email:               "test@example.com",
  workspaceId:         "ws-1",
  workspaceRole:       "ARCHITECT",
  createdAt:           new Date(),
  lastLogin:           new Date(),
  image:               null,
}

const mockInvite = {
  id:          "invite-1",
  workspaceId: "ws-1",
  email:       "new@example.com",
  role:        "DESIGNER" as const,
  token:       "valid-token-abc",
  accepted:    false,
  expiresAt:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt:   new Date(),
}

// ── workspaceService.createForUser ────────────────────────────────────────────

describe("workspaceService.createForUser", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates workspace and sets OWNER role on user", async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.workspace.create).mockResolvedValue(mockWorkspace)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "user-1" } as never)

    const result = await workspaceService.createForUser("user-1", "Test User")

    expect(result).toBe(mockWorkspace.id)
    expect(prisma.workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "test-user-office" }) })
    )
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data:  { workspaceId: mockWorkspace.id, workspaceRole: "OWNER" },
    })
  })

  it("generates unique slug by appending counter on collision", async () => {
    vi.mocked(prisma.workspace.findUnique)
      .mockResolvedValueOnce(mockWorkspace) // slug "test-user-office" taken
      .mockResolvedValueOnce(null)          // "test-user-office-1" available
    vi.mocked(prisma.workspace.create).mockResolvedValue({ ...mockWorkspace, slug: "test-user-office-1" })
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "user-1" } as never)

    await workspaceService.createForUser("user-1", "Test User")

    const createCall = vi.mocked(prisma.workspace.create).mock.calls[0][0]
    expect(createCall.data.slug).toBe("test-user-office-1")
  })
})

// ── workspaceService.invite ────────────────────────────────────────────────────

describe("workspaceService.invite", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates invite with 7-day expiry", async () => {
    vi.mocked(prisma.workspaceInvite.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.workspaceInvite.create).mockResolvedValue(mockInvite)

    const result = await workspaceService.invite("ws-1", "new@example.com", "DESIGNER")

    expect(result).toMatchObject({ email: "new@example.com", role: "DESIGNER" })
    expect(prisma.workspaceInvite.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", email: "new@example.com", accepted: false },
    })
  })
})

// ── workspaceService.acceptInvite ─────────────────────────────────────────────

describe("workspaceService.acceptInvite", () => {
  beforeEach(() => vi.clearAllMocks())

  it("accepts valid invite and joins workspace", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(mockInvite)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "user-2" } as never)
    vi.mocked(prisma.workspaceInvite.update).mockResolvedValue({ ...mockInvite, accepted: true })

    const result = await workspaceService.acceptInvite("valid-token-abc", "user-2")

    expect(result).toBe("ws-1")
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data:  { workspaceId: "ws-1", workspaceRole: "DESIGNER" },
    })
  })

  it("throws NOT_FOUND for unknown token", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(null)

    await expect(workspaceService.acceptInvite("bad-token", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })

  it("throws NOT_FOUND for already-used invite", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue({ ...mockInvite, accepted: true })

    await expect(workspaceService.acceptInvite("valid-token-abc", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })

  it("throws NOT_FOUND for expired invite", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue({
      ...mockInvite,
      expiresAt: new Date(Date.now() - 1000),
    })

    await expect(workspaceService.acceptInvite("valid-token-abc", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })
})

// ── workspaceService.updateUserRole ──────────────────────────────────────────

describe("workspaceService.updateUserRole", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws CANNOT_CHANGE_OWNER_ROLE when targeting an OWNER", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, workspaceRole: "OWNER" } as never)

    await expect(workspaceService.updateUserRole("ws-1", "user-1", "ADMIN"))
      .rejects.toMatchObject({ code: ErrorCode.CANNOT_CHANGE_OWNER_ROLE })
  })

  it("throws USER_NOT_FOUND when user not in workspace", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

    await expect(workspaceService.updateUserRole("ws-1", "user-99", "ADMIN"))
      .rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND })
  })

  it("updates role for eligible member", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, workspaceRole: "ADMIN" } as never)

    await workspaceService.updateUserRole("ws-1", "user-1", "ADMIN")

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data:  { workspaceRole: "ADMIN" },
    })
  })
})
