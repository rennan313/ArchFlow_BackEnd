import type { AutomationKey } from "@prisma/client"
import { taskRepository } from "@/repositories/task.repository"
import { projectRepository } from "@/repositories/project.repository"
import { AppError, ErrorCode } from "@/lib/errors"

export const taskService = {
  async listByProject(projectId: string, workspaceId: string) {
    const project = await projectRepository.findById(projectId, workspaceId)
    if (!project) throw new AppError(ErrorCode.PROJECT_NOT_FOUND)
    return taskRepository.findByProject(projectId, workspaceId)
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
