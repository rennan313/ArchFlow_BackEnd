import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/timeEntry.repository")
vi.mock("@/lib/tenantGuard")

import { timerService } from "@/modules/worklog/services/timer.service"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"

const mockEntry = { id: "te-1", workspaceId: "ws-1", userId: "user-1", status: "RUNNING" as const }

describe("timerService.start — tenant guard", () => {
  beforeEach(() => vi.clearAllMocks())

  it("validates projectId/clientId/taskId/categoryId belong to the workspace before starting", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(timeEntryRepository.start).mockResolvedValue(mockEntry as never)

    await timerService.start("ws-1", "user-1", {
      projectId: "proj-1", clientId: "client-1", taskId: "task-1", categoryId: "cat-1", isBillable: true,
    } as never)

    expect(assertWorkspaceReferences).toHaveBeenCalledWith("ws-1", expect.objectContaining({
      projectId: "proj-1", clientId: "client-1", taskId: "task-1", activityCategoryId: "cat-1",
    }))
    expect(timeEntryRepository.start).toHaveBeenCalled()
  })

  it("rejects a cross-tenant taskId (CROSS_TENANT_REFERENCE) before ever calling repository.start", async () => {
    vi.mocked(assertWorkspaceReferences).mockRejectedValue(new AppError(ErrorCode.CROSS_TENANT_REFERENCE))

    await expect(
      timerService.start("ws-1", "user-1", { taskId: "other-ws-task", isBillable: false } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(timeEntryRepository.start).not.toHaveBeenCalled()
  })
})

describe("timerService.pause / resume / stop — self-service only", () => {
  beforeEach(() => vi.clearAllMocks())

  it("pause() delegates id/workspaceId/userId straight to the repository CAS — no admin override to pause someone else's timer", async () => {
    vi.mocked(timeEntryRepository.pause).mockResolvedValue({ ...mockEntry, status: "PAUSED" } as never)

    await timerService.pause("te-1", "ws-1", "user-1")

    expect(timeEntryRepository.pause).toHaveBeenCalledWith("te-1", "ws-1", "user-1")
  })

  it("resume() delegates id/workspaceId/userId straight to the repository CAS", async () => {
    vi.mocked(timeEntryRepository.resume).mockResolvedValue(mockEntry as never)

    await timerService.resume("te-1", "ws-1", "user-1")

    expect(timeEntryRepository.resume).toHaveBeenCalledWith("te-1", "ws-1", "user-1")
  })

  it("stop() delegates id/workspaceId/userId straight to the repository CAS", async () => {
    vi.mocked(timeEntryRepository.stop).mockResolvedValue({ ...mockEntry, status: "COMPLETED" } as never)

    await timerService.stop("te-1", "ws-1", "user-1")

    expect(timeEntryRepository.stop).toHaveBeenCalledWith("te-1", "ws-1", "user-1")
  })

  it("propagates TIMER_ALREADY_RUNNING from the repository's P2002 conflict path untouched", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(timeEntryRepository.start).mockRejectedValue(
      new AppError(ErrorCode.TIMER_ALREADY_RUNNING, JSON.stringify({ activeEntryId: "te-active" })),
    )

    await expect(
      timerService.start("ws-1", "user-1", { isBillable: false } as never),
    ).rejects.toMatchObject({ code: ErrorCode.TIMER_ALREADY_RUNNING })
  })
})
