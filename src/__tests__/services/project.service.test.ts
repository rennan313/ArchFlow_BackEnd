import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError } from "@/lib/errors"

vi.mock("@/repositories/project.repository")
vi.mock("@/repositories/followup.repository")
vi.mock("@/repositories/task.repository")
vi.mock("@/repositories/client.repository")
vi.mock("@/repositories/proposal.repository")
vi.mock("@/repositories/opportunity.repository")
vi.mock("@/services/automation.service")
vi.mock("@/services/task.service")
vi.mock("@/lib/pagination")
vi.mock("@/modules/financial/financial.module", () => ({
  financialDocumentService: { hasDocumentsForProject: vi.fn(), hasDocumentsForClient: vi.fn() },
}))

import { projectService } from "@/services/project.service"
import { projectRepository } from "@/repositories/project.repository"
import { followUpRepository } from "@/repositories/followup.repository"
import { taskRepository } from "@/repositories/task.repository"
import { clientRepository } from "@/repositories/client.repository"
import { automationService } from "@/services/automation.service"
import { taskService } from "@/services/task.service"
import { buildMeta } from "@/lib/pagination"
import { financialDocumentService } from "@/modules/financial/financial.module"
import { ErrorCode } from "@/lib/errors"

const mockProject = {
  id:               "proj-1",
  userId:           "user-1",
  clientId:         "client-1",
  name:             "Casa Jardim",
  type:             "RESIDENTIAL" as const,
  status:           "BRIEFING" as const,
  phase:            "BRIEFING" as const,
  estimatedEndDate: null,
  createdAt:        new Date(),
  updatedAt:        new Date(),
}

describe("projectService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
  })

  it("defaults phase to BRIEFING when not provided", async () => {
    vi.mocked(projectRepository.create).mockResolvedValue(mockProject as never)

    await projectService.create("workspace-1", "user-1", { clientId: "client-1", name: "Casa Jardim", type: "RESIDENTIAL" } as never)

    expect(projectRepository.create).toHaveBeenCalledWith("workspace-1", "user-1", expect.objectContaining({ phase: "BRIEFING" }))
  })

  it("respects an explicit phase", async () => {
    vi.mocked(projectRepository.create).mockResolvedValue({ ...mockProject, phase: "EXECUTIVE_DESIGN" } as never)

    await projectService.create("workspace-1", "user-1", { clientId: "client-1", name: "Casa Jardim", type: "RESIDENTIAL", phase: "EXECUTIVE_DESIGN" } as never)

    expect(projectRepository.create).toHaveBeenCalledWith("workspace-1", "user-1", expect.objectContaining({ phase: "EXECUTIVE_DESIGN" }))
  })

  it("rejects (CROSS_TENANT_REFERENCE) when clientId does not belong to the workspace", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(null)

    await expect(
      projectService.create("workspace-1", "user-1", { clientId: "other-workspace-client", name: "x", type: "RESIDENTIAL" } as never),
    ).rejects.toThrow(AppError)
    expect(projectRepository.create).not.toHaveBeenCalled()
  })
})

describe("projectService.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("blocks deletion (PROJECT_HAS_FINANCIAL_HISTORY) when a FinancialDocument references this project", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue(mockProject as never)
    vi.mocked(financialDocumentService.hasDocumentsForProject).mockResolvedValue(true)

    await expect(
      projectService.delete("proj-1", "workspace-1"),
    ).rejects.toMatchObject({ code: ErrorCode.PROJECT_HAS_FINANCIAL_HISTORY })
    expect(projectRepository.delete).not.toHaveBeenCalled()
  })

  it("allows deletion when no FinancialDocument references this project", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue(mockProject as never)
    vi.mocked(financialDocumentService.hasDocumentsForProject).mockResolvedValue(false)
    vi.mocked(projectRepository.delete).mockResolvedValue({ count: 1 } as never)

    await projectService.delete("proj-1", "workspace-1")

    expect(projectRepository.delete).toHaveBeenCalledWith("proj-1", "workspace-1")
  })
})

describe("projectService.phaseStats", () => {
  beforeEach(() => vi.clearAllMocks())

  it("fills every phase, defaulting to zero, and reports overdue count", async () => {
    vi.mocked(projectRepository.phaseStats).mockResolvedValue([
      { phase: "BRIEFING", _count: { _all: 3 } },
      { phase: "DELIVERY", _count: { _all: 1 } },
    ] as never)
    vi.mocked(projectRepository.countOverdue).mockResolvedValue(2)

    const result = await projectService.phaseStats("workspace-1")

    expect(result.byPhase).toEqual({
      BRIEFING: 3, PRELIMINARY_DESIGN: 0, EXECUTIVE_DESIGN: 0, COMPATIBILIZATION: 0, APPROVAL: 0, DELIVERY: 1,
    })
    expect(result.overdueCount).toBe(2)
  })
})

describe("projectService — Automações 02-05 (task per phase) e 10 (post-delivery follow-up)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates the matching task when phase moves to PRELIMINARY_DESIGN", async () => {
    vi.mocked(projectRepository.findById)
      .mockResolvedValueOnce(mockProject as never)
      .mockResolvedValueOnce({ ...mockProject, phase: "PRELIMINARY_DESIGN" } as never)
    vi.mocked(projectRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(taskRepository.findByProjectAndKey).mockResolvedValue(null)
    vi.mocked(taskService.createAutomated).mockResolvedValue({ id: "task-1" } as never)
    vi.mocked(automationService.record).mockResolvedValue({} as never)

    await projectService.update("proj-1", "workspace-1", { phase: "PRELIMINARY_DESIGN" } as never)

    expect(taskService.createAutomated).toHaveBeenCalledWith("workspace-1", "proj-1", "user-1", "Desenvolver Anteprojeto", "TASK_PRELIMINARY_DESIGN")
    expect(automationService.record).toHaveBeenCalledWith("workspace-1", "TASK_PRELIMINARY_DESIGN", expect.objectContaining({ resultType: "TASK_CREATED" }))
  })

  it("does not create a duplicate task when one already exists for this phase", async () => {
    vi.mocked(projectRepository.findById)
      .mockResolvedValueOnce(mockProject as never)
      .mockResolvedValueOnce({ ...mockProject, phase: "PRELIMINARY_DESIGN" } as never)
    vi.mocked(projectRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(taskRepository.findByProjectAndKey).mockResolvedValue({ id: "task-existing" } as never)

    await projectService.update("proj-1", "workspace-1", { phase: "PRELIMINARY_DESIGN" } as never)

    expect(taskService.createAutomated).not.toHaveBeenCalled()
    expect(automationService.record).not.toHaveBeenCalled()
  })

  it("does not create a task when the automation is disabled", async () => {
    vi.mocked(projectRepository.findById)
      .mockResolvedValueOnce(mockProject as never)
      .mockResolvedValueOnce({ ...mockProject, phase: "EXECUTIVE_DESIGN" } as never)
    vi.mocked(projectRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(false)

    await projectService.update("proj-1", "workspace-1", { phase: "EXECUTIVE_DESIGN" } as never)

    expect(taskService.createAutomated).not.toHaveBeenCalled()
  })

  it("creates a post-delivery follow-up due in 30 days when phase moves to DELIVERY", async () => {
    vi.mocked(projectRepository.findById)
      .mockResolvedValueOnce(mockProject as never)
      .mockResolvedValueOnce({ ...mockProject, phase: "DELIVERY" } as never)
    vi.mocked(projectRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(followUpRepository.findByProjectAutomation).mockResolvedValue(null)
    vi.mocked(followUpRepository.create).mockResolvedValue({ id: "fu-1" } as never)
    vi.mocked(automationService.record).mockResolvedValue({} as never)

    await projectService.update("proj-1", "workspace-1", { phase: "DELIVERY" } as never)

    expect(followUpRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", projectId: "proj-1", clientId: "client-1",
      title: "Satisfação do Cliente", source: "AUTOMATION",
    }))
    expect(automationService.record).toHaveBeenCalledWith("workspace-1", "POST_DELIVERY_FOLLOWUP", expect.objectContaining({ resultType: "FOLLOWUP_CREATED" }))
  })

  it("does not create a duplicate post-delivery follow-up if one already exists", async () => {
    vi.mocked(projectRepository.findById)
      .mockResolvedValueOnce(mockProject as never)
      .mockResolvedValueOnce({ ...mockProject, phase: "DELIVERY" } as never)
    vi.mocked(projectRepository.update).mockResolvedValue(undefined as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(true)
    vi.mocked(followUpRepository.findByProjectAutomation).mockResolvedValue({ id: "fu-existing" } as never)

    await projectService.update("proj-1", "workspace-1", { phase: "DELIVERY" } as never)

    expect(followUpRepository.create).not.toHaveBeenCalled()
    expect(automationService.record).not.toHaveBeenCalled()
  })

  it("does not trigger anything when phase is provided but unchanged", async () => {
    vi.mocked(projectRepository.findById)
      .mockResolvedValueOnce(mockProject as never)
      .mockResolvedValueOnce(mockProject as never)
    vi.mocked(projectRepository.update).mockResolvedValue(undefined as never)

    await projectService.update("proj-1", "workspace-1", { phase: "BRIEFING" } as never)

    expect(taskService.createAutomated).not.toHaveBeenCalled()
    expect(followUpRepository.create).not.toHaveBeenCalled()
  })
})

describe("projectService.list", () => {
  beforeEach(() => vi.clearAllMocks())

  it("filters by phase", async () => {
    vi.mocked(projectRepository.findMany).mockResolvedValue({ data: [mockProject] as never, total: 1 })
    vi.mocked(buildMeta).mockReturnValue({ total: 1, page: 1, limit: 20, totalPages: 1 })

    const result = await projectService.list("workspace-1", { page: 1, limit: 20, phase: "BRIEFING", sortBy: "createdAt", sortOrder: "desc" } as never)

    expect(result.data).toHaveLength(1)
    expect(projectRepository.findMany).toHaveBeenCalledWith("workspace-1", expect.objectContaining({ phase: "BRIEFING" }))
  })
})
