import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/meeting.repository")
vi.mock("@/repositories/client.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/repositories/proposal.repository")
vi.mock("@/services/automation.service")
vi.mock("@/services/entityLifecycle.service")

import { meetingService } from "@/services/meeting.service"
import { meetingRepository } from "@/repositories/meeting.repository"
import { clientRepository } from "@/repositories/client.repository"
import { projectRepository } from "@/repositories/project.repository"
import { proposalRepository } from "@/repositories/proposal.repository"
import { automationService } from "@/services/automation.service"
import { entityLifecycleService } from "@/services/entityLifecycle.service"

const mockMeeting = {
  id: "meeting-1", userId: "user-1", clientId: "client-1", title: "Briefing inicial",
  type: "DISCOVERY" as const, status: "SCHEDULED" as const, scheduledAt: new Date(),
}

describe("meetingService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(automationService.isEnabled).mockResolvedValue(false)
  })

  it("creates the meeting when clientId belongs to the workspace", async () => {
    vi.mocked(meetingRepository.create).mockResolvedValue(mockMeeting as never)

    const result = await meetingService.create("workspace-1", "user-1", {
      clientId: "client-1", title: "Briefing inicial", type: "DISCOVERY", scheduledAt: new Date(),
    } as never)

    expect(meetingRepository.create).toHaveBeenCalled()
    expect(result.id).toBe("meeting-1")
  })

  // Fase 5 audit, P0 #1 — confirmed live: a workspace could create a Meeting
  // with a clientId from a different workspace, and the response embedded
  // that foreign client's name/company (PII leak). This is the regression test.
  it("rejects with CROSS_TENANT_REFERENCE when clientId belongs to a different workspace", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(null)

    await expect(
      meetingService.create("workspace-B", "user-1", {
        clientId: "client-from-workspace-A", title: "x", type: "DISCOVERY", scheduledAt: new Date(),
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(meetingRepository.create).not.toHaveBeenCalled()
  })

  it("rejects with CROSS_TENANT_REFERENCE when projectId belongs to a different workspace", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue(null)

    await expect(
      meetingService.create("workspace-B", "user-1", {
        clientId: "client-1", projectId: "project-from-workspace-A", title: "x", type: "DISCOVERY", scheduledAt: new Date(),
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(meetingRepository.create).not.toHaveBeenCalled()
  })

  it("rejects with CROSS_TENANT_REFERENCE when proposalId belongs to a different workspace", async () => {
    vi.mocked(proposalRepository.findById).mockResolvedValue(null)

    await expect(
      meetingService.create("workspace-B", "user-1", {
        clientId: "client-1", proposalId: "proposal-from-workspace-A", title: "x", type: "DISCOVERY", scheduledAt: new Date(),
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(meetingRepository.create).not.toHaveBeenCalled()
  })
})

describe("meetingService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(meetingRepository.findById).mockResolvedValue(mockMeeting as never)
  })

  it("updates when no cross-tenant reference is provided", async () => {
    vi.mocked(meetingRepository.update).mockResolvedValue(mockMeeting as never)

    await meetingService.update("meeting-1", "workspace-1", { title: "Novo título" } as never)

    expect(meetingRepository.update).toHaveBeenCalled()
  })

  it("rejects with CROSS_TENANT_REFERENCE when reassigning projectId to another workspace's project", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue(null)

    await expect(
      meetingService.update("meeting-1", "workspace-B", { projectId: "project-from-workspace-A" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(meetingRepository.update).not.toHaveBeenCalled()
  })
})

describe("meetingService.getById / delete — not-found mapping", () => {
  beforeEach(() => vi.clearAllMocks())

  // Fase 5 audit, P1 #2 — the service-level throw was always correct; the bug
  // was the missing serviceError.ts mapping (covered separately in
  // serviceError.test.ts). This confirms the service still throws the right
  // AppError code so that mapping has something correct to map.
  it("throws AppError(MEETING_NOT_FOUND) when the meeting does not exist in the workspace", async () => {
    vi.mocked(meetingRepository.findById).mockResolvedValue(null)

    await expect(meetingService.getById("missing-id", "workspace-1")).rejects.toMatchObject({
      code: ErrorCode.MEETING_NOT_FOUND,
    })
  })

  it("delete throws AppError(MEETING_NOT_FOUND) for a cross-tenant id instead of archiving", async () => {
    vi.mocked(meetingRepository.findById).mockResolvedValue(null)

    await expect(meetingService.delete("meeting-from-other-workspace", "workspace-B", "user-1")).rejects.toThrow(AppError)
    expect(entityLifecycleService.archive).not.toHaveBeenCalled()
  })
})
