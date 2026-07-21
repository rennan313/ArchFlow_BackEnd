import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// CORE-6 (Sprint 0) — $transaction defaults to invoking its callback with the
// same mock object (so `tx.user.update`/`tx.workspaceInvite.updateMany`
// resolve to the exact mocks below), matching acceptInvite's move from
// array-form $transaction([...]) to callback-form $transaction(tx => ...)
// wrapped in withTransactionRetry — same convention as every other
// transactional repository/service mock in this suite. This mock was
// missing `$transaction` and `user.findUnique` entirely before Sprint 0,
// which is why every acceptInvite test below was failing regardless of this
// change (USER_NOT_FOUND fired first because `user` was always undefined).
vi.mock("@/lib/prisma", () => {
  const mock = {
    workspace:       { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    workspaceInvite: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    user:            { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction:    vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})
vi.mock("@/services/automation.service", () => ({
  automationService: { ensureDefaults: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { createTrialSubscription: vi.fn().mockResolvedValue({ id: "sub-1", status: "TRIAL" }) },
}))

import { workspaceService } from "@/services/workspace.service"
import { prisma } from "@/lib/prisma"
import { subscriptionService } from "@/services/subscription.service"

const mockPrisma = prisma as unknown as {
  workspace: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  workspaceInvite: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> }
  user: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

const mockWorkspace = {
  id:              "ws-1",
  name:            "Test Office",
  slug:            "test-office",
  plan:            "STARTER" as const,
  active:          true,
  dashboardLayout: null,
  timezone:        null,
  createdAt:       new Date(),
  updatedAt:       new Date(),
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

  // No free tier — every new workspace must start with an explicit trial,
  // created eagerly here rather than lazily on first limit check.
  it("creates a trial subscription for the new workspace", async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.workspace.create).mockResolvedValue(mockWorkspace)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "user-1" } as never)

    await workspaceService.createForUser("user-1", "Test User")

    expect(subscriptionService.createTrialSubscription).toHaveBeenCalledWith(mockWorkspace.id)
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
// CORE-6 (Sprint 0) — acceptInvite moved from array-form $transaction([...])
// to callback-form wrapped in withTransactionRetry (same class of gap CORE-1
// fixed in subscription.service.ts#changePlan: a 2-collection write with no
// retry protection). These tests were failing before Sprint 0 for reasons
// unrelated to that specific gap (the mock never set up `user.findUnique`,
// so `user` was always undefined and USER_NOT_FOUND fired before the
// invite/transaction logic ever ran) — fixed alongside this change since
// CORE-9 names both "Workspace" and "Retry" as Sprint 0 test priorities.

// The invitee: not yet in a workspace (acceptInvite rejects
// ALREADY_IN_WORKSPACE otherwise), email matching the invite's (case-
// insensitively) — both are real preconditions the old mock data violated.
const mockInvitee = { id: "user-2", email: "new@example.com", workspaceId: null }

describe("workspaceService.acceptInvite", () => {
  beforeEach(() => vi.clearAllMocks())

  it("accepts valid invite and joins workspace", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(mockInvite)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockInvitee as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "user-2" } as never)
    mockPrisma.workspaceInvite.updateMany.mockResolvedValue({ count: 1 })

    const result = await workspaceService.acceptInvite("valid-token-abc", "user-2")

    expect(result).toBe("ws-1")
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data:  { workspaceId: "ws-1", workspaceRole: "DESIGNER" },
    })
    expect(mockPrisma.workspaceInvite.updateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", accepted: false },
      data:  { accepted: true },
    })
  })

  it("throws NOT_FOUND for unknown token", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockInvitee as never)

    await expect(workspaceService.acceptInvite("bad-token", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })

  it("throws NOT_FOUND for already-used invite", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue({ ...mockInvite, accepted: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockInvitee as never)

    await expect(workspaceService.acceptInvite("valid-token-abc", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })

  it("throws NOT_FOUND for expired invite", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue({
      ...mockInvite,
      expiresAt: new Date(Date.now() - 1000),
    })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockInvitee as never)

    await expect(workspaceService.acceptInvite("valid-token-abc", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })

  it("throws USER_NOT_FOUND when the accepting user doesn't exist", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(mockInvite)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(workspaceService.acceptInvite("valid-token-abc", "ghost-user"))
      .rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND })
  })

  it("throws INVITE_EMAIL_MISMATCH when the invite was sent to a different email", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(mockInvite)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2", email: "someone-else@example.com", workspaceId: null } as never)

    await expect(workspaceService.acceptInvite("valid-token-abc", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.INVITE_EMAIL_MISMATCH })
  })

  it("throws ALREADY_IN_WORKSPACE when the user already belongs to a workspace", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(mockInvite)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2", email: "new@example.com", workspaceId: "other-ws" } as never)

    await expect(workspaceService.acceptInvite("valid-token-abc", "user-2"))
      .rejects.toMatchObject({ code: ErrorCode.ALREADY_IN_WORKSPACE })
  })

  // CORE-6 — regression test for the retry wrapping itself: a losing
  // write-conflict on the first attempt must not surface as a raw error,
  // same guarantee every financial write and subscription.service.ts#changePlan
  // already have (ADR-003).
  it("retries once on a transient transaction conflict and succeeds", async () => {
    vi.mocked(prisma.workspaceInvite.findUnique).mockResolvedValue(mockInvite)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockInvitee as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "user-2" } as never)
    mockPrisma.workspaceInvite.updateMany.mockResolvedValue({ count: 1 })

    const transientError = new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock. Please retry your transaction", { code: "P2034", clientVersion: "test" })
    mockPrisma.$transaction
      .mockImplementationOnce(() => { throw transientError })
      .mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(mockPrisma))

    const result = await workspaceService.acceptInvite("valid-token-abc", "user-2")

    expect(result).toBe("ws-1")
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
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
