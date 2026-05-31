import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst:         vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create:            vi.fn(),
    },
  },
}))
vi.mock("@/lib/hash")
vi.mock("@/services/workspace.service")

import { provisionService } from "@/services/provision.service"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/hash"
import { workspaceService } from "@/services/workspace.service"

const supabaseUser = { supabaseId: "supa-abc", email: "user@example.com", name: "Test User", password: "TestPass1" }

const provisioned = {
  id: "user-1", supabaseId: "supa-abc", email: "user@example.com", name: "Test User",
  role: "USER", workspaceId: "ws-1", workspaceRole: "OWNER",
  onboardingCompleted: false, onboardingStep: 1,
  password: "$2b$12$hash", provider: "supabase", googleId: null, image: null,
  workspaceType: null, teamSize: null, primaryGoal: null,
  lastLogin: new Date(), createdAt: new Date(), updatedAt: new Date(),
}

// ── provision — happy path ─────────────────────────────────────────────────────

describe("provisionService.provision", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates user and workspace for new supabaseId", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    vi.mocked(hashPassword).mockResolvedValue("$2b$12$hashed")
    vi.mocked(prisma.user.create).mockResolvedValue(provisioned as never)
    vi.mocked(workspaceService.createForUser).mockResolvedValue("ws-1")
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(provisioned as never)

    const result = await provisionService.provision(supabaseUser)

    expect(result.alreadyProvisioned).toBe(false)
    expect(result.user.supabaseId).toBe("supa-abc")
    expect(result.accessToken).toBeTruthy()
    expect(workspaceService.createForUser).toHaveBeenCalledWith("user-1", "Test User")
  })

  it("returns idempotent result when user already exists with same supabaseId", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(provisioned as never)
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(provisioned as never)

    const result = await provisionService.provision(supabaseUser)

    expect(result.alreadyProvisioned).toBe(true)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("throws EMAIL_TAKEN when email belongs to pre-migration user (no supabaseId)", async () => {
    const preMigrationUser = { ...provisioned, supabaseId: null }
    vi.mocked(prisma.user.findFirst).mockResolvedValue(preMigrationUser as never)

    await expect(provisionService.provision(supabaseUser))
      .rejects.toThrow("EMAIL_TAKEN")
  })

  it("handles P2002 race condition gracefully", async () => {
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce(null)               // initial check: not found
      .mockResolvedValueOnce(provisioned as never) // re-fetch after P2002
    vi.mocked(hashPassword).mockResolvedValue("$2b$12$hashed")
    const p2002 = new Prisma.PrismaClientKnownRequestError("", { code: "P2002", clientVersion: "5" })
    vi.mocked(prisma.user.create).mockRejectedValue(p2002)
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(provisioned as never)

    const result = await provisionService.provision(supabaseUser)

    expect(result.alreadyProvisioned).toBe(true)
  })
})
