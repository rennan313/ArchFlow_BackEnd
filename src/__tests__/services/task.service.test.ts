import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError } from "@/lib/errors"

vi.mock("@/repositories/task.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/repositories/timeEntry.repository")

import { taskService } from "@/services/task.service"
import { taskRepository } from "@/repositories/task.repository"
import { projectRepository } from "@/repositories/project.repository"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"

describe("taskService.listByProject", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws PROJECT_NOT_FOUND when the project does not belong to the workspace", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue(null)
    await expect(taskService.listByProject("proj-1", "workspace-1")).rejects.toThrow(AppError)
  })

  it("returns the project's tasks merged with a batched worklogSummary (no per-task query)", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue({ id: "proj-1" } as never)
    vi.mocked(taskRepository.findByProject).mockResolvedValue([{ id: "task-1" }] as never)
    vi.mocked(timeEntryRepository.aggregateByTasks).mockResolvedValue({
      totals: [{ taskId: "task-1", _sum: { durationSeconds: 3600 } }],
      lastEntries: [{ taskId: "task-1", startedAt: new Date("2026-07-10"), status: "COMPLETED", userId: "user-1" }],
    } as never)

    const result = await taskService.listByProject("proj-1", "workspace-1")

    expect(timeEntryRepository.aggregateByTasks).toHaveBeenCalledWith(["task-1"], "workspace-1")
    expect(result).toHaveLength(1)
    expect(result[0].worklogSummary).toEqual({
      totalSeconds: 3600, lastEntryAt: new Date("2026-07-10"), activeTimerUserId: null,
    })
  })

  it("surfaces activeTimerUserId when the task's most recent entry is still OPEN", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue({ id: "proj-1" } as never)
    vi.mocked(taskRepository.findByProject).mockResolvedValue([{ id: "task-1" }] as never)
    vi.mocked(timeEntryRepository.aggregateByTasks).mockResolvedValue({
      totals: [],
      lastEntries: [{ taskId: "task-1", startedAt: new Date("2026-07-15"), status: "OPEN", userId: "user-2" }],
    } as never)

    const result = await taskService.listByProject("proj-1", "workspace-1")

    expect(result[0].worklogSummary.activeTimerUserId).toBe("user-2")
  })
})

describe("taskService.createAutomated", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a task with source AUTOMATION", async () => {
    vi.mocked(taskRepository.create).mockResolvedValue({ id: "task-1" } as never)

    await taskService.createAutomated("workspace-1", "proj-1", "user-1", "Desenvolver Anteprojeto", "TASK_PRELIMINARY_DESIGN" as never)

    expect(taskRepository.create).toHaveBeenCalledWith(expect.objectContaining({ source: "AUTOMATION", title: "Desenvolver Anteprojeto" }))
  })
})

describe("taskService.setStatus", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws TASK_NOT_FOUND when the task does not exist", async () => {
    vi.mocked(taskRepository.findById).mockResolvedValue(null)
    await expect(taskService.setStatus("task-1", "workspace-1", "DONE")).rejects.toThrow(AppError)
  })

  it("updates the status and returns the refreshed task", async () => {
    vi.mocked(taskRepository.findById)
      .mockResolvedValueOnce({ id: "task-1", status: "PENDING" } as never)
      .mockResolvedValueOnce({ id: "task-1", status: "DONE" } as never)
    vi.mocked(taskRepository.setStatus).mockResolvedValue(undefined as never)

    const result = await taskService.setStatus("task-1", "workspace-1", "DONE")

    expect(taskRepository.setStatus).toHaveBeenCalledWith("task-1", "workspace-1", "DONE")
    expect(result?.status).toBe("DONE")
  })
})
