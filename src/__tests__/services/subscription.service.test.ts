import { describe, it, expect, vi, beforeEach } from "vitest"

// Inline prisma mock — extends global setup with proposalMedia
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace:     { findUnique: vi.fn() },
    user:          { count: vi.fn() },
    proposal:      { count: vi.fn() },
    proposalMedia: { count: vi.fn() },
  },
}))

import { subscriptionService } from "@/services/subscription.service"
import { prisma } from "@/lib/prisma"

const ws    = vi.mocked(prisma.workspace)
const user  = vi.mocked(prisma.user)
const prop  = vi.mocked(prisma.proposal)
const media = vi.mocked(prisma.proposalMedia)

/** Return a workspace with the given plan */
function withPlan(plan: string) {
  ws.findUnique.mockResolvedValue({ plan } as never)
}

// ── getWorkspacePlan ──────────────────────────────────────────────────────────

describe("subscriptionService.getWorkspacePlan", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns the plan stored on the workspace", async () => {
    withPlan("PROFESSIONAL")
    expect(await subscriptionService.getWorkspacePlan("ws-1")).toBe("PROFESSIONAL")
  })

  it("returns STARTER when workspace is not found", async () => {
    ws.findUnique.mockResolvedValue(null)
    expect(await subscriptionService.getWorkspacePlan("missing")).toBe("STARTER")
  })

  it("returns STARTER when plan field is missing", async () => {
    ws.findUnique.mockResolvedValue({} as never)
    expect(await subscriptionService.getWorkspacePlan("ws-2")).toBe("STARTER")
  })
})

// ── getLimits ─────────────────────────────────────────────────────────────────

describe("subscriptionService.getLimits", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns plan name and its limit set", async () => {
    withPlan("STUDIO")
    const result = await subscriptionService.getLimits("ws-1")
    expect(result.plan).toBe("STUDIO")
    expect(result.limits.maxUsers).toBe(-1)       // unlimited
    expect(result.limits.canApiAccess).toBe(true)
  })

  it("returns STARTER limits when workspace missing", async () => {
    ws.findUnique.mockResolvedValue(null)
    const result = await subscriptionService.getLimits("ws-1")
    expect(result.plan).toBe("STARTER")
    expect(result.limits.maxUsers).toBe(1)
    expect(result.limits.canApiAccess).toBe(false)
  })
})

// ── canAddUser ────────────────────────────────────────────────────────────────

describe("subscriptionService.canAddUser", () => {
  beforeEach(() => vi.clearAllMocks())

  it("allows when plan has unlimited users (STUDIO)", async () => {
    withPlan("STUDIO")
    const result = await subscriptionService.canAddUser("ws-1")
    expect(result.allowed).toBe(true)
    expect(result.plan).toBe("STUDIO")
    // Should not count users when unlimited
    expect(user.count).not.toHaveBeenCalled()
  })

  it("allows when under the user limit (STARTER: max 1)", async () => {
    withPlan("STARTER")
    user.count.mockResolvedValue(0)
    const result = await subscriptionService.canAddUser("ws-1")
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(0)
    expect(result.limit).toBe(1)
  })

  it("blocks when at the user limit (STARTER: max 1, current 1)", async () => {
    withPlan("STARTER")
    user.count.mockResolvedValue(1)
    const result = await subscriptionService.canAddUser("ws-1")
    expect(result.allowed).toBe(false)
    expect(result.current).toBe(1)
    expect(result.limit).toBe(1)
    expect(result.reason).toMatch(/upgrade/i)
  })

  it("allows when under PROFESSIONAL limit (max 5, current 3)", async () => {
    withPlan("PROFESSIONAL")
    user.count.mockResolvedValue(3)
    const result = await subscriptionService.canAddUser("ws-1")
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(5)
  })

  it("blocks when PROFESSIONAL limit exceeded (max 5, current 5)", async () => {
    withPlan("PROFESSIONAL")
    user.count.mockResolvedValue(5)
    const result = await subscriptionService.canAddUser("ws-1")
    expect(result.allowed).toBe(false)
    expect(result.plan).toBe("PROFESSIONAL")
  })
})

// ── canCreateProposal ─────────────────────────────────────────────────────────

describe("subscriptionService.canCreateProposal", () => {
  beforeEach(() => vi.clearAllMocks())

  it("allows when plan has unlimited proposals (STUDIO)", async () => {
    withPlan("STUDIO")
    const result = await subscriptionService.canCreateProposal("ws-1")
    expect(result.allowed).toBe(true)
    expect(prop.count).not.toHaveBeenCalled()
  })

  it("allows when under monthly proposal limit (STARTER: 20, current 10)", async () => {
    withPlan("STARTER")
    prop.count.mockResolvedValue(10)
    const result = await subscriptionService.canCreateProposal("ws-1")
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(10)
    expect(result.limit).toBe(20)
  })

  it("blocks when monthly proposal limit reached (STARTER: 20, current 20)", async () => {
    withPlan("STARTER")
    prop.count.mockResolvedValue(20)
    const result = await subscriptionService.canCreateProposal("ws-1")
    expect(result.allowed).toBe(false)
    expect(result.current).toBe(20)
    expect(result.reason).toMatch(/month/i)
  })

  it("counts proposals from the start of the current month", async () => {
    withPlan("STARTER")
    prop.count.mockResolvedValue(0)
    await subscriptionService.canCreateProposal("ws-1")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = prop.count.mock.calls[0]![0] as any
    expect(call.where.createdAt.gte).toBeInstanceOf(Date)
    // The gte date should be on the 1st of the current month
    const startOfMonth = call.where.createdAt.gte as Date
    expect(startOfMonth.getDate()).toBe(1)
    expect(startOfMonth.getHours()).toBe(0)
  })
})

// ── canUploadFile ─────────────────────────────────────────────────────────────

describe("subscriptionService.canUploadFile", () => {
  beforeEach(() => vi.clearAllMocks())

  it("allows when plan has unlimited storage (STUDIO)", async () => {
    withPlan("STUDIO")
    const result = await subscriptionService.canUploadFile("ws-1", 50)
    expect(result.allowed).toBe(true)
    expect(media.count).not.toHaveBeenCalled()
  })

  it("allows when storage usage plus file is under limit", async () => {
    withPlan("STARTER")     // maxStorageMb: 500
    media.count.mockResolvedValue(100) // 100 assets × 2 MB ≈ 200 MB used
    const result = await subscriptionService.canUploadFile("ws-1", 50)
    expect(result.allowed).toBe(true)
  })

  it("blocks when adding the file would exceed storage limit", async () => {
    withPlan("STARTER")     // maxStorageMb: 500
    media.count.mockResolvedValue(240) // 240 × 2 = 480 MB used; +50 = 530 MB > 500
    const result = await subscriptionService.canUploadFile("ws-1", 50)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/storage/i)
    expect(result.limit).toBe(500)
  })

  it("blocks when estimated usage exactly meets the limit", async () => {
    withPlan("STARTER")     // maxStorageMb: 500
    media.count.mockResolvedValue(250) // 250 × 2 = 500 MB; +1 = 501 > 500
    const result = await subscriptionService.canUploadFile("ws-1", 1)
    expect(result.allowed).toBe(false)
  })
})

// ── canUseFeature ─────────────────────────────────────────────────────────────

describe("subscriptionService.canUseFeature", () => {
  beforeEach(() => vi.clearAllMocks())

  it("allows customBranding on PROFESSIONAL plan", async () => {
    withPlan("PROFESSIONAL")
    const result = await subscriptionService.canUseFeature("ws-1", "canCustomBranding")
    expect(result.allowed).toBe(true)
    expect(result.plan).toBe("PROFESSIONAL")
  })

  it("blocks customBranding on STARTER plan", async () => {
    withPlan("STARTER")
    const result = await subscriptionService.canUseFeature("ws-1", "canCustomBranding")
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/upgrade/i)
  })

  it("allows exportPdf on PROFESSIONAL plan", async () => {
    withPlan("PROFESSIONAL")
    const result = await subscriptionService.canUseFeature("ws-1", "canExportPdf")
    expect(result.allowed).toBe(true)
  })

  it("blocks exportPdf on STARTER plan", async () => {
    withPlan("STARTER")
    const result = await subscriptionService.canUseFeature("ws-1", "canExportPdf")
    expect(result.allowed).toBe(false)
  })

  it("allows apiAccess on STUDIO plan", async () => {
    withPlan("STUDIO")
    const result = await subscriptionService.canUseFeature("ws-1", "canApiAccess")
    expect(result.allowed).toBe(true)
  })

  it("blocks apiAccess on PROFESSIONAL plan", async () => {
    withPlan("PROFESSIONAL")
    const result = await subscriptionService.canUseFeature("ws-1", "canApiAccess")
    expect(result.allowed).toBe(false)
  })
})

// ── getUsageSummary ───────────────────────────────────────────────────────────

describe("subscriptionService.getUsageSummary", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns full usage summary for STARTER plan", async () => {
    withPlan("STARTER")
    user.count.mockResolvedValue(1)
    prop.count.mockResolvedValue(8)

    const summary = await subscriptionService.getUsageSummary("ws-1")

    expect(summary.plan).toBe("STARTER")
    expect(summary.usage.users.current).toBe(1)
    expect(summary.usage.users.limit).toBe(1)
    expect(summary.usage.users.unlimited).toBe(false)
    expect(summary.usage.proposalsThisMonth.current).toBe(8)
    expect(summary.usage.proposalsThisMonth.limit).toBe(20)
    expect(summary.usage.proposalsThisMonth.unlimited).toBe(false)
    expect(summary.features.customBranding).toBe(false)
    expect(summary.features.exportPdf).toBe(false)
    expect(summary.features.apiAccess).toBe(false)
  })

  it("returns unlimited flags for STUDIO plan", async () => {
    withPlan("STUDIO")
    user.count.mockResolvedValue(12)
    prop.count.mockResolvedValue(47)

    const summary = await subscriptionService.getUsageSummary("ws-1")

    expect(summary.plan).toBe("STUDIO")
    expect(summary.usage.users.unlimited).toBe(true)
    expect(summary.usage.proposalsThisMonth.unlimited).toBe(true)
    expect(summary.features.customBranding).toBe(true)
    expect(summary.features.exportPdf).toBe(true)
    expect(summary.features.apiAccess).toBe(true)
  })

  it("fetches user and proposal counts in parallel", async () => {
    withPlan("PROFESSIONAL")
    user.count.mockResolvedValue(3)
    prop.count.mockResolvedValue(15)

    await subscriptionService.getUsageSummary("ws-1")

    expect(user.count).toHaveBeenCalledTimes(1)
    expect(prop.count).toHaveBeenCalledTimes(1)
  })
})
