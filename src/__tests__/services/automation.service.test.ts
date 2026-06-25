import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError } from "@/lib/errors"

vi.mock("@/repositories/automation.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/repositories/proposal.repository")
vi.mock("@/repositories/followup.repository")

import { automationService } from "@/services/automation.service"
import { automationRepository } from "@/repositories/automation.repository"
import { projectRepository } from "@/repositories/project.repository"
import { proposalRepository } from "@/repositories/proposal.repository"
import { followUpRepository } from "@/repositories/followup.repository"
import { AUTOMATION_KEYS } from "@/lib/automations"

describe("automationService.ensureDefaults", () => {
  beforeEach(() => vi.clearAllMocks())

  it("upserts all 10 fixed automation definitions", async () => {
    vi.mocked(automationRepository.upsertDefault).mockResolvedValue({} as never)

    await automationService.ensureDefaults("workspace-1")

    expect(automationRepository.upsertDefault).toHaveBeenCalledTimes(AUTOMATION_KEYS.length)
    expect(automationRepository.upsertDefault).toHaveBeenCalledWith("workspace-1", "AUTO_CREATE_PROJECT_ON_APPROVED", expect.objectContaining({ name: expect.any(String) }))
  })
})

describe("automationService.isEnabled", () => {
  beforeEach(() => vi.clearAllMocks())

  it("defaults to true when the workspace row doesn't exist yet", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue(null)
    expect(await automationService.isEnabled("workspace-1", "AUTO_CREATE_PROJECT_ON_APPROVED")).toBe(true)
  })

  it("respects an explicit disabled toggle", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue({ enabled: false } as never)
    expect(await automationService.isEnabled("workspace-1", "AUTO_CREATE_PROJECT_ON_APPROVED")).toBe(false)
  })
})

describe("automationService.setEnabled", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws AUTOMATION_NOT_FOUND when the id doesn't belong to the workspace", async () => {
    vi.mocked(automationRepository.upsertDefault).mockResolvedValue({} as never)
    vi.mocked(automationRepository.findById).mockResolvedValue(null)

    await expect(automationService.setEnabled("missing-id", "workspace-1", false)).rejects.toThrow(AppError)
  })

  it("toggles enabled and returns the updated row", async () => {
    vi.mocked(automationRepository.upsertDefault).mockResolvedValue({} as never)
    vi.mocked(automationRepository.findById)
      .mockResolvedValueOnce({ id: "auto-1", enabled: true } as never)
      .mockResolvedValueOnce({ id: "auto-1", enabled: false } as never)
    vi.mocked(automationRepository.setEnabled).mockResolvedValue(undefined as never)

    const result = await automationService.setEnabled("auto-1", "workspace-1", false)

    expect(automationRepository.setEnabled).toHaveBeenCalledWith("auto-1", "workspace-1", false)
    expect(result?.enabled).toBe(false)
  })
})

describe("automationService.getDashboardStats", () => {
  beforeEach(() => vi.clearAllMocks())

  it("aggregates today's runs by result type", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue({ enabled: false } as never) // skip scheduled checks side effects
    vi.mocked(automationRepository.countTodayByResultType).mockResolvedValue([
      { resultType: "PROJECT_CREATED",  _count: { _all: 2 } },
      { resultType: "FOLLOWUP_CREATED", _count: { _all: 3 } },
      { resultType: "ALERT_GENERATED",  _count: { _all: 1 } },
    ] as never)

    const result = await automationService.getDashboardStats("workspace-1")

    expect(result).toEqual({ executedToday: 6, projectsCreated: 2, followUpsCreated: 3, alertsGenerated: 1 })
  })
})

describe("automationService.checkOverdueProjects", () => {
  beforeEach(() => vi.clearAllMocks())

  it("does nothing when the automation is disabled", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue({ enabled: false } as never)

    await automationService.checkOverdueProjects("workspace-1")

    expect(projectRepository.findOverdue).not.toHaveBeenCalled()
  })

  it("records an alert once per overdue project, skipping ones already alerted recently", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue({ enabled: true } as never)
    vi.mocked(projectRepository.findOverdue).mockResolvedValue([
      { id: "proj-1", name: "Casa A" }, { id: "proj-2", name: "Casa B" },
    ] as never)
    vi.mocked(automationRepository.findRecentRunEntityIds).mockResolvedValue(new Set(["proj-2"]))
    vi.mocked(automationRepository.createRun).mockResolvedValue({} as never)

    await automationService.checkOverdueProjects("workspace-1")

    expect(automationRepository.findRecentRunEntityIds).toHaveBeenCalledWith(
      "workspace-1", "PROJECT_OVERDUE_ALERT", ["proj-1", "proj-2"], expect.any(Date),
    )
    expect(automationRepository.createRun).toHaveBeenCalledTimes(1)
    expect(automationRepository.createRun).toHaveBeenCalledWith(expect.objectContaining({ entityId: "proj-1", resultType: "ALERT_GENERATED" }))
  })
})

describe("automationService.checkStaleProposals", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a follow-up only when one doesn't already exist for the proposal", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue({ enabled: true } as never)
    vi.mocked(proposalRepository.findStaleSent).mockResolvedValue([
      { id: "prop-1", userId: "user-1", opportunityId: "opp-1", clientId: null, clientName: "Cliente A" },
    ] as never)
    vi.mocked(followUpRepository.findExistingProposalAutomationLinks).mockResolvedValue({
      opportunityIds: new Set(), clientIds: new Set(),
    })
    vi.mocked(followUpRepository.create).mockResolvedValue({ id: "fu-1" } as never)
    vi.mocked(automationRepository.createRun).mockResolvedValue({} as never)

    await automationService.checkStaleProposals("workspace-1")

    expect(followUpRepository.findExistingProposalAutomationLinks).toHaveBeenCalledWith("workspace-1", ["opp-1"], [])
    expect(followUpRepository.create).toHaveBeenCalledWith(expect.objectContaining({ opportunityId: "opp-1", title: "Entrar em contato com cliente", source: "AUTOMATION" }))
    expect(automationRepository.createRun).toHaveBeenCalledWith(expect.objectContaining({ resultType: "FOLLOWUP_CREATED", entityId: "prop-1" }))
  })

  it("skips proposals that already have an automation-generated follow-up", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue({ enabled: true } as never)
    vi.mocked(proposalRepository.findStaleSent).mockResolvedValue([
      { id: "prop-1", userId: "user-1", opportunityId: "opp-1", clientId: null, clientName: "Cliente A" },
    ] as never)
    vi.mocked(followUpRepository.findExistingProposalAutomationLinks).mockResolvedValue({
      opportunityIds: new Set(["opp-1"]), clientIds: new Set(),
    })

    await automationService.checkStaleProposals("workspace-1")

    expect(followUpRepository.create).not.toHaveBeenCalled()
  })

  it("skips proposals with neither an opportunityId nor a clientId, without querying", async () => {
    vi.mocked(automationRepository.isEnabled).mockResolvedValue({ enabled: true } as never)
    vi.mocked(proposalRepository.findStaleSent).mockResolvedValue([
      { id: "prop-1", userId: "user-1", opportunityId: null, clientId: null, clientName: "Cliente Órfão" },
    ] as never)

    await automationService.checkStaleProposals("workspace-1")

    expect(followUpRepository.findExistingProposalAutomationLinks).not.toHaveBeenCalled()
    expect(followUpRepository.create).not.toHaveBeenCalled()
  })
})
