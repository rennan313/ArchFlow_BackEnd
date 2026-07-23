import { prisma } from "@/lib/prisma"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { resolveWorklogContext } from "../resolveClientFromProject"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import type { Prisma } from "@prisma/client"
import type { CreateManualTimeEntryInput, UpdateTimeEntryInput, TimeEntryQueryInput, BulkUpdateTimeEntriesInput } from "@/validations/timeEntry"

// scopedUserId (ADR-022): non-null when the caller lacks view:time-entries —
// resolved at the route layer (services never import rbac.ts), forces every
// read/write in this service to the caller's own entries.
export const timeEntryService = {
  async list(workspaceId: string, query: TimeEntryQueryInput, scopedUserId: string | null) {
    const { data, total } = await timeEntryRepository.findMany(workspaceId, query, scopedUserId)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const entry = await timeEntryRepository.findById(id, workspaceId)
    if (!entry) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
    return entry
  },

  async createManual(workspaceId: string, userId: string, input: CreateManualTimeEntryInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, clientId: input.clientId,
      taskId: input.taskId, activityCategoryId: input.categoryId,
    })
    const { clientId } = await resolveWorklogContext(workspaceId, input.projectId, input.clientId)

    return timeEntryRepository.createManual({
      workspaceId, userId,
      projectId: input.projectId, clientId, taskId: input.taskId, categoryId: input.categoryId,
      description: input.description, tags: input.tags, isBillable: input.isBillable,
      startedAt: input.startedAt, endedAt: input.endedAt,
    })
  },

  async update(id: string, workspaceId: string, scopedUserId: string | null, input: UpdateTimeEntryInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, clientId: input.clientId,
      taskId: input.taskId, activityCategoryId: input.categoryId,
    })
    // ADR-025 — when projectId is being set, the project's own client always
    // wins over whatever clientId the caller sent alongside it.
    const { clientId } = await resolveWorklogContext(workspaceId, input.projectId, input.clientId)

    // Scalar FK assignment, not `{ connect: { id } }` — the repository writes
    // through prisma.timeEntry.updateMany(), and Prisma rejects nested
    // relation writes (connect/disconnect) there: `data` for updateMany only
    // accepts TimeEntryUpdateManyMutationInput/TimeEntryUncheckedUpdateManyInput,
    // neither of which has a `project`/`client`/`task`/`category` key. Passing
    // one throws PrismaClientValidationError at the Client layer (not a
    // PrismaClientKnownRequestError, so handleServiceError's P2025 special
    // case never caught it either) — a 500 on every edit that touched
    // projectId/clientId/taskId/categoryId, which is exactly what this fixes.
    // updateTimeEntrySchema's fields all have z.string().min(1) (see its
    // comment on why "clear this field" isn't supported yet), so every
    // defined value here is a real, non-empty id.
    const data: Prisma.TimeEntryUncheckedUpdateManyInput = {
      ...(input.projectId  !== undefined && { projectId: input.projectId }),
      ...(clientId !== undefined && { clientId }),
      ...(input.taskId     !== undefined && { taskId: input.taskId }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.tags         !== undefined && { tags: input.tags }),
      ...(input.isBillable   !== undefined && { isBillable: input.isBillable }),
    }

    const result = await timeEntryRepository.update(id, workspaceId, scopedUserId, data)
    if (result.count === 0) {
      const exists = await timeEntryRepository.findById(id, workspaceId)
      if (!exists) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
      throw new AppError(ErrorCode.TIME_ENTRY_NOT_EDITABLE)
    }
    return this.getById(id, workspaceId)
  },

  async archive(id: string, workspaceId: string, userId: string, scopedUserId: string | null) {
    const entry = await this.getById(id, workspaceId)
    if (scopedUserId && entry.userId !== scopedUserId) throw new AppError(ErrorCode.TIME_ENTRY_NOT_EDITABLE)

    await entityLifecycleService.archive({
      entity: "TimeEntry", id, workspaceId, userId,
      // Scoped delegate — narrows the generic archive() to this entry's
      // owner when the caller lacks view:time-entries, same defense-in-depth
      // shape as timeEntry.repository.ts#update's scopedUserId.
      delegate: {
        updateMany: (args) => prisma.timeEntry.updateMany({
          ...args,
          where: { ...args.where, ...(scopedUserId && { userId: scopedUserId }) },
        }),
      },
      guard: async () => {
        // ADR-024 — a Step is "active" (can't be archived yet) while it's the
        // OPEN activity of a running WorkSession. switchContext()/pause()/
        // finish() close it first (status → COMPLETED), same guard shape as
        // the pre-V3 RUNNING/PAUSED check.
        if (entry.status === "OPEN") {
          throw new AppError(ErrorCode.TIME_ENTRY_ACTIVE_CANNOT_ARCHIVE)
        }
      },
    })
  },

  async restore(id: string, workspaceId: string, userId: string, scopedUserId: string | null) {
    const entry = await this.getById(id, workspaceId)
    if (scopedUserId && entry.userId !== scopedUserId) throw new AppError(ErrorCode.TIME_ENTRY_NOT_EDITABLE)

    await entityLifecycleService.restore({
      entity: "TimeEntry", id, workspaceId, userId,
      delegate: {
        updateMany: (args) => prisma.timeEntry.updateMany({
          ...args,
          where: { ...args.where, ...(scopedUserId && { userId: scopedUserId }) },
        }),
      },
    })
    return this.getById(id, workspaceId)
  },

  // ADR-026 — "Atividades Pendentes": entries missing projectId or
  // categoryId, derived at read time, no separate collection.
  async listPending(workspaceId: string, scopedUserId: string | null, page: number, limit: number) {
    const { data, total } = await timeEntryRepository.findPending(workspaceId, scopedUserId, page, limit)
    return { data, pagination: buildMeta(total, page, limit) }
  },

  countPending(workspaceId: string, scopedUserId: string | null) {
    return timeEntryRepository.countPending(workspaceId, scopedUserId)
  },

  // ADR-026 — batch association from the pending-activities / post-finish
  // review screens ("associar projeto em lote"). A single optional
  // projectId/categoryId/isBillable is applied to every id in the same
  // write; ADR-025's Project → Client rule is resolved once and applied to
  // all of them together.
  async bulkUpdate(ids: string[], workspaceId: string, scopedUserId: string | null, input: Omit<BulkUpdateTimeEntriesInput, "ids">) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, activityCategoryId: input.categoryId,
    })
    const { clientId } = await resolveWorklogContext(workspaceId, input.projectId, undefined)

    // Same fix as update() above — scalar FK, not `{ connect }`, since this
    // also writes through prisma.timeEntry.updateMany().
    const data: Prisma.TimeEntryUncheckedUpdateManyInput = {
      ...(input.projectId  !== undefined && { projectId: input.projectId }),
      ...(clientId   !== undefined && { clientId }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.isBillable !== undefined && { isBillable: input.isBillable }),
    }

    return timeEntryRepository.bulkUpdate(ids, workspaceId, scopedUserId, data)
  },
}
