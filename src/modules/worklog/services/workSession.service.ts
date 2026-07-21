import { workSessionRepository } from "@/repositories/workSession.repository"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { resolveWorklogContext } from "../resolveClientFromProject"
import { AppError, ErrorCode } from "@/lib/errors"
import type { StartWorkSessionInput, SwitchActivityInput } from "@/validations/workSession"

// Timer control is deliberately self-service only in this phase (ADR-022) —
// no admin override to pause/resume/finish someone else's session. A future
// "team currently working" view (Fase 2) is read-only over
// workSessionRepository.findActiveByUser-equivalents, not a write path.
export const workSessionService = {
  async getActive(workspaceId: string, userId: string) {
    return workSessionRepository.findActiveByUser(workspaceId, userId)
  },

  async getById(id: string, workspaceId: string, scopedUserId: string | null) {
    const session = await workSessionRepository.findById(id, workspaceId)
    if (!session) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
    if (scopedUserId && session.userId !== scopedUserId) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
    const steps = await timeEntryRepository.findByWorkSession(id, workspaceId)
    return { session, steps }
  },

  async start(workspaceId: string, userId: string, input: StartWorkSessionInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, clientId: input.clientId,
      taskId: input.taskId, activityCategoryId: input.categoryId,
    })
    const { clientId } = await resolveWorklogContext(workspaceId, input.projectId, input.clientId)

    return workSessionRepository.start({
      workspaceId, userId,
      projectId: input.projectId, clientId, taskId: input.taskId, categoryId: input.categoryId,
      description: input.description, tags: input.tags, isBillable: input.isBillable,
      startSource: input.startSource,
    })
  },

  // "+ Nova Atividade" — every context field is optional (SwitchActivityInput),
  // same opacity-to-organization contract as start() (ADR-025).
  async switchContext(workspaceId: string, userId: string, input: SwitchActivityInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, clientId: input.clientId,
      taskId: input.taskId, activityCategoryId: input.categoryId,
    })
    const { clientId } = await resolveWorklogContext(workspaceId, input.projectId, input.clientId)

    return workSessionRepository.switchContext(workspaceId, userId, {
      projectId: input.projectId, clientId, taskId: input.taskId, categoryId: input.categoryId,
      description: input.description, tags: input.tags, isBillable: input.isBillable,
    })
  },

  pause(workspaceId: string, userId: string) {
    return workSessionRepository.pause(workspaceId, userId)
  },

  resume(workspaceId: string, userId: string) {
    return workSessionRepository.resume(workspaceId, userId)
  },

  finish(workspaceId: string, userId: string) {
    return workSessionRepository.finish(workspaceId, userId)
  },
}
