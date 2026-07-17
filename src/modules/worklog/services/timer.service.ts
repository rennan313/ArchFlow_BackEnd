import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import type { StartTimerInput } from "@/validations/timeEntry"

// Timer control is deliberately self-service only in this phase (ADR-022) —
// no admin override to pause/stop someone else's running timer. A future
// "team currently working" view (Fase 2) is read-only over
// timeEntryRepository.findActiveByUser-equivalents, not a write path.
export const timerService = {
  async start(workspaceId: string, userId: string, input: StartTimerInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, clientId: input.clientId,
      taskId: input.taskId, activityCategoryId: input.categoryId,
    })

    return timeEntryRepository.start({
      workspaceId, userId,
      projectId: input.projectId, clientId: input.clientId, taskId: input.taskId, categoryId: input.categoryId,
      description: input.description, tags: input.tags, isBillable: input.isBillable,
    })
  },

  pause(id: string, workspaceId: string, userId: string) {
    return timeEntryRepository.pause(id, workspaceId, userId)
  },

  resume(id: string, workspaceId: string, userId: string) {
    return timeEntryRepository.resume(id, workspaceId, userId)
  },

  stop(id: string, workspaceId: string, userId: string) {
    return timeEntryRepository.stop(id, workspaceId, userId)
  },
}

// Metadata edits (description, tags, project/client/task/category,
// isBillable) on a RUNNING/PAUSED entry go through the same
// PUT /time-entries/[id] path as a COMPLETED one — timeEntryService.update
// doesn't care about status, so there's no separate "edit active timer"
// route or schema here (updateTimeEntrySchema covers both).
