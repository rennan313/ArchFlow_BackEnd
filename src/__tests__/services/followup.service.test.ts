import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/followup.repository")
vi.mock("@/repositories/opportunity.repository")

import { followUpService } from "@/services/followup.service"
import { followUpRepository } from "@/repositories/followup.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"

describe("followUpService.create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates the follow-up when the opportunityId belongs to the workspace", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValue({ id: "opp-1" } as never)
    vi.mocked(followUpRepository.create).mockResolvedValue({ id: "fu-1" } as never)

    const result = await followUpService.create("opp-1", "workspace-1", "user-1", {
      nextContactDate: new Date().toISOString(),
    } as never)

    expect(result).toMatchObject({ id: "fu-1" })
  })

  // Already protected before this audit (opportunityId was resolved against
  // workspaceId here) — now routed through the same centralized guard as
  // project/meeting/document, so the behavior is consistent across modules.
  it("rejects with CROSS_TENANT_REFERENCE when opportunityId belongs to a different workspace", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValue(null)

    await expect(
      followUpService.create("opp-from-workspace-A", "workspace-B", "user-1", {
        nextContactDate: new Date().toISOString(),
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(followUpRepository.create).not.toHaveBeenCalled()
  })
})

describe("followUpService.listByOpportunity", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns the follow-ups when the opportunityId belongs to the workspace", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValue({ id: "opp-1" } as never)
    vi.mocked(followUpRepository.findByOpportunity).mockResolvedValue([{ id: "fu-1" }] as never)

    const result = await followUpService.listByOpportunity("opp-1", "workspace-1")

    expect(result).toEqual([{ id: "fu-1" }])
  })

  // Code review finding (Fase 5.95) — this used to throw OPPORTUNITY_NOT_FOUND
  // (404) via an ad-hoc check while create() threw CROSS_TENANT_REFERENCE (403)
  // for the same condition. Both now go through the same guard.
  it("rejects with CROSS_TENANT_REFERENCE when opportunityId belongs to a different workspace", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValue(null)

    await expect(
      followUpService.listByOpportunity("opp-from-workspace-A", "workspace-B"),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(followUpRepository.findByOpportunity).not.toHaveBeenCalled()
  })
})
