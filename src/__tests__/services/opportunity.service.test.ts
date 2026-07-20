import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/opportunity.repository")
vi.mock("@/repositories/client.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/services/automation.service")
vi.mock("@/services/entityLifecycle.service")
vi.mock("@/lib/pagination")

import { opportunityService } from "@/services/opportunity.service"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { clientRepository } from "@/repositories/client.repository"
import { projectRepository } from "@/repositories/project.repository"
import { automationService } from "@/services/automation.service"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import { buildMeta } from "@/lib/pagination"

const mockOpportunity = {
  id:               "opp-1",
  userId:           "user-1",
  clientId:         "client-1",
  title:            "Reforma de apartamento",
  projectType:      "Residencial",
  estimatedRevenue: 50000,
  probability:      10,
  stage:            "LEAD" as const,
  proposals:        [] as { id: string; status: string; createdAt: Date }[],
  createdAt:        new Date(),
  updatedAt:        new Date(),
}

describe("opportunityService.create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("applies STAGE_PROBABILITY for FIRST_CONTACT", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(opportunityRepository.create).mockResolvedValue({ ...mockOpportunity, stage: "FIRST_CONTACT", probability: 15 } as never)

    const result = await opportunityService.create("workspace-1", "user-1", {
      clientId: "client-1", title: "Lead novo", projectType: "Residencial", stage: "FIRST_CONTACT",
    } as never)

    expect(opportunityRepository.create).toHaveBeenCalledWith(expect.objectContaining({ stage: "FIRST_CONTACT", probability: 15 }))
    expect(result.probability).toBe(15)
  })

  it("throws CROSS_TENANT_REFERENCE when client does not belong to workspace", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(null)

    await expect(
      opportunityService.create("workspace-1", "user-1", { clientId: "missing", title: "x", projectType: "y" } as never),
    ).rejects.toThrow(AppError)
    await expect(
      opportunityService.create("workspace-1", "user-1", { clientId: "missing", title: "x", projectType: "y" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
  })

  // Kanban Sprint — Fase D (MEL-07): quick-create-in-column can create an
  // Opportunity already in APPROVED. Same automation as update() must fire —
  // see the identical guarantee for onPhaseChanged/project.service.test.ts.
  it("fires autoCreateProjectOnApproval when created directly with stage=APPROVED", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(opportunityRepository.create).mockResolvedValue({ ...mockOpportunity, stage: "APPROVED", probability: 100 } as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(projectRepository.findByOpportunityId).mockResolvedValue(null)
    vi.mocked(projectRepository.create).mockResolvedValue({ id: "proj-1", name: mockOpportunity.title } as never)
    vi.mocked(automationService.record).mockResolvedValue({} as never)

    await opportunityService.create("workspace-1", "user-1", {
      clientId: "client-1", title: "Lead já fechado", projectType: "Residencial", stage: "APPROVED",
    } as never)

    expect(projectRepository.create).toHaveBeenCalledWith("workspace-1", "user-1", expect.objectContaining({
      clientId: "client-1", opportunityId: "opp-1", phase: "BRIEFING",
    }))
  })

  it("does not fire autoCreateProjectOnApproval when created in a non-APPROVED stage", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(opportunityRepository.create).mockResolvedValue({ ...mockOpportunity, stage: "LEAD" } as never)

    await opportunityService.create("workspace-1", "user-1", {
      clientId: "client-1", title: "Lead novo", projectType: "Residencial",
    } as never)

    expect(projectRepository.create).not.toHaveBeenCalled()
  })
})

describe("opportunityService.update", () => {
  beforeEach(() => vi.clearAllMocks())

  it("recalculates probability when stage moves to FIRST_CONTACT", async () => {
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "FIRST_CONTACT", probability: 15 } as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue(undefined as never)

    const result = await opportunityService.update("opp-1", "workspace-1", { stage: "FIRST_CONTACT" } as never)

    expect(opportunityRepository.update).toHaveBeenCalledWith("opp-1", "workspace-1", expect.objectContaining({ stage: "FIRST_CONTACT", probability: 15 }), undefined)
    expect(result.stage).toBe("FIRST_CONTACT")
  })

  it("does not override an explicitly provided probability", async () => {
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "FIRST_CONTACT", probability: 40 } as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue(undefined as never)

    await opportunityService.update("opp-1", "workspace-1", { stage: "FIRST_CONTACT", probability: 40 } as never)

    expect(opportunityRepository.update).toHaveBeenCalledWith("opp-1", "workspace-1", expect.objectContaining({ probability: 40 }), undefined)
  })
})

describe("opportunityService — Automação 01 (auto-create Project on APPROVED)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a Project when stage moves to APPROVED and the automation is enabled", async () => {
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "APPROVED", probability: 100 } as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(projectRepository.findByOpportunityId).mockResolvedValue(null)
    vi.mocked(projectRepository.create).mockResolvedValue({ id: "proj-1", name: mockOpportunity.title } as never)
    vi.mocked(automationService.record).mockResolvedValue({} as never)

    await opportunityService.update("opp-1", "workspace-1", { stage: "APPROVED" } as never)

    expect(projectRepository.create).toHaveBeenCalledWith("workspace-1", "user-1", expect.objectContaining({
      clientId: "client-1", opportunityId: "opp-1", name: "Reforma de apartamento", type: "RESIDENTIAL", phase: "BRIEFING",
    }))
    expect(automationService.record).toHaveBeenCalledWith("workspace-1", "AUTO_CREATE_PROJECT_ON_APPROVED", expect.objectContaining({ resultType: "PROJECT_CREATED" }))
  })

  it("does not create a duplicate Project if one was already auto-created for this opportunity", async () => {
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "APPROVED" } as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(projectRepository.findByOpportunityId).mockResolvedValue({ id: "proj-existing" } as never)

    await opportunityService.update("opp-1", "workspace-1", { stage: "APPROVED" } as never)

    expect(projectRepository.create).not.toHaveBeenCalled()
    expect(automationService.record).not.toHaveBeenCalled()
  })

  it("does not create a Project when the automation is disabled", async () => {
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "APPROVED" } as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(false)

    await opportunityService.update("opp-1", "workspace-1", { stage: "APPROVED" } as never)

    expect(projectRepository.create).not.toHaveBeenCalled()
  })

  it("does not re-trigger when the opportunity was already APPROVED", async () => {
    const approved = { ...mockOpportunity, stage: "APPROVED" as const }
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(approved as never)
      .mockResolvedValueOnce(approved as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue(undefined as never)

    await opportunityService.update("opp-1", "workspace-1", { stage: "APPROVED", probability: 100 } as never)

    expect(projectRepository.create).not.toHaveBeenCalled()
  })
})

// Kanban Sprint — Fase A (MEL-04): optimistic concurrency on update().
describe("opportunityService.update — optimistic concurrency (MEL-04)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("succeeds and never touches the STALE_WRITE path when expectedUpdatedAt is omitted (backward compatible)", async () => {
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "FIRST_CONTACT" } as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue(undefined as never) // no .count on the resolved value at all

    await expect(
      opportunityService.update("opp-1", "workspace-1", { stage: "FIRST_CONTACT" } as never),
    ).resolves.toMatchObject({ stage: "FIRST_CONTACT" })
  })

  it("succeeds when expectedUpdatedAt matches the record's current updatedAt (count=1)", async () => {
    const knownUpdatedAt = mockOpportunity.updatedAt
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "FIRST_CONTACT" } as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue({ count: 1 } as never)

    const result = await opportunityService.update("opp-1", "workspace-1", {
      stage: "FIRST_CONTACT", expectedUpdatedAt: knownUpdatedAt,
    } as never)

    expect(opportunityRepository.update).toHaveBeenCalledWith(
      "opp-1", "workspace-1", expect.objectContaining({ stage: "FIRST_CONTACT" }), knownUpdatedAt,
    )
    expect(result.stage).toBe("FIRST_CONTACT")
  })

  it("throws STALE_WRITE (not a silent overwrite) when the record changed since expectedUpdatedAt was read (count=0)", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValueOnce(mockOpportunity as never)
    vi.mocked(opportunityRepository.update).mockResolvedValue({ count: 0 } as never)

    await expect(
      opportunityService.update("opp-1", "workspace-1", {
        stage: "APPROVED", expectedUpdatedAt: new Date("2020-01-01"),
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.STALE_WRITE })
  })

  it("two concurrent approvals racing the same opportunity: only the winner's write succeeds, and autoCreateProjectOnApproval runs at most once — the loser never reaches it", async () => {
    // Both requests read the SAME pre-write state (before.stage = LEAD) —
    // this is exactly the race the original code comment flagged as
    // accepted/unclosed prior to MEL-04.
    vi.mocked(opportunityRepository.findById)
      .mockResolvedValueOnce(mockOpportunity as never)                                    // request A's "before"
      .mockResolvedValueOnce(mockOpportunity as never)                                    // request B's "before"
      .mockResolvedValueOnce({ ...mockOpportunity, stage: "APPROVED" } as never)           // request A's "after" (only reached by the winner)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(projectRepository.findByOpportunityId).mockResolvedValue(null)
    vi.mocked(projectRepository.create).mockResolvedValue({ id: "proj-1", name: mockOpportunity.title } as never)
    vi.mocked(automationService.record).mockResolvedValue({} as never)

    const sameToken = mockOpportunity.updatedAt
    // Request A's CAS write wins (count=1); request B's CAS write loses (count=0) — simulating A having already advanced updatedAt in the DB by the time B's updateMany runs.
    vi.mocked(opportunityRepository.update)
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never)

    const requestA = opportunityService.update("opp-1", "workspace-1", { stage: "APPROVED", expectedUpdatedAt: sameToken } as never)
    const requestB = opportunityService.update("opp-1", "workspace-1", { stage: "APPROVED", expectedUpdatedAt: sameToken } as never)

    const [resultA, resultB] = await Promise.allSettled([requestA, requestB])

    expect(resultA.status).toBe("fulfilled")
    expect(resultB.status).toBe("rejected")
    if (resultB.status === "rejected") {
      expect(resultB.reason).toMatchObject({ code: ErrorCode.STALE_WRITE })
    }
    // The decisive assertion: even though both requests observed
    // before.stage !== "APPROVED", the Project is created exactly once.
    expect(projectRepository.create).toHaveBeenCalledTimes(1)
  })
})

// CORE-2 (Sprint 0) — referential guard mirroring RC-2.3's Project/Client
// pattern, one hop upstream: an Opportunity that already auto-created a
// Project can no longer be deleted physically.
describe("opportunityService.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("archives normally when no Project was ever created from this opportunity", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValue(mockOpportunity as never)
    vi.mocked(projectRepository.findByOpportunityId).mockResolvedValue(null)
    vi.mocked(entityLifecycleService.archive).mockImplementation(async (opts) => {
      if (opts.guard) await opts.guard()
    })

    await opportunityService.delete("opp-1", "workspace-1", "user-1")

    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "Opportunity", id: "opp-1", workspaceId: "workspace-1", userId: "user-1" }),
    )
  })

  it("blocks deletion with OPPORTUNITY_HAS_PROJECT when a Project was already auto-created", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValue(mockOpportunity as never)
    vi.mocked(projectRepository.findByOpportunityId).mockResolvedValue({ id: "proj-existing" } as never)
    vi.mocked(entityLifecycleService.archive).mockImplementation(async (opts) => {
      if (opts.guard) await opts.guard()
    })

    await expect(opportunityService.delete("opp-1", "workspace-1", "user-1")).rejects.toMatchObject({
      code: ErrorCode.OPPORTUNITY_HAS_PROJECT,
    })
  })
})

describe("opportunityService.list", () => {
  beforeEach(() => vi.clearAllMocks())

  it("filters by stage=FIRST_CONTACT and returns weighted revenue", async () => {
    vi.mocked(opportunityRepository.findMany).mockResolvedValue({ data: [{ ...mockOpportunity, stage: "FIRST_CONTACT", probability: 15 }] as never, total: 1 })
    vi.mocked(buildMeta).mockReturnValue({ total: 1, page: 1, limit: 20, totalPages: 1 })

    const result = await opportunityService.list("workspace-1", { page: 1, limit: 20, stage: "FIRST_CONTACT", sortBy: "createdAt", sortOrder: "desc" } as never)

    expect(result.data).toHaveLength(1)
    expect(result.data[0].weightedRevenue).toBe(7500) // 50000 * 15%
  })
})
