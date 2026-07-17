import type { AutomationKey } from "@prisma/client"
import { taskRepository } from "@/repositories/task.repository"
import { projectRepository } from "@/repositories/project.repository"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { AppError, ErrorCode } from "@/lib/errors"

export const taskService = {
  // worklogSummary is merged in from a single batched aggregateByTasks() call
  // (Fase 2A) instead of one worklog query per task — see
  // timeEntry.repository.ts#aggregateByTasks. lastEntries is already sorted
  // desc by startedAt, so the first match per taskId is that task's most
  // recent entry regardless of status.
  async listByProject(projectId: string, workspaceId: string) {
    const project = await projectRepository.findById(projectId, workspaceId)
    if (!project) throw new AppError(ErrorCode.PROJECT_NOT_FOUND)

    const tasks = await taskRepository.findByProject(projectId, workspaceId)
    const { totals, lastEntries } = await timeEntryRepository.aggregateByTasks(tasks.map((t) => t.id), workspaceId)

    return tasks.map((task) => {
      const totalSeconds = totals.find((t) => t.taskId === task.id)?._sum.durationSeconds ?? 0
      const lastEntry = lastEntries.find((e) => e.taskId === task.id)
      const activeEntry = lastEntries.find((e) => e.taskId === task.id && (e.status === "RUNNING" || e.status === "PAUSED"))

      return {
        ...task,
        worklogSummary: {
          totalSeconds,
          lastEntryAt: lastEntry?.startedAt ?? null,
          activeTimerUserId: activeEntry?.userId ?? null,
        },
      }
    })
  },

  createAutomated(workspaceId: string, projectId: string, assigneeId: string, title: string, automationKey: AutomationKey) {
    return taskRepository.create({ workspaceId, projectId, assigneeId, title, automationKey, source: "AUTOMATION" })
  },

  async setStatus(id: string, workspaceId: string, status: "PENDING" | "DONE") {
    const existing = await taskRepository.findById(id, workspaceId)
    if (!existing) throw new AppError(ErrorCode.TASK_NOT_FOUND)
    await taskRepository.setStatus(id, workspaceId, status)
    return taskRepository.findById(id, workspaceId)
  },
}
