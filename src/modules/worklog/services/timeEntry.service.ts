import { prisma } from "@/lib/prisma"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import type { Prisma } from "@prisma/client"
import type { CreateManualTimeEntryInput, UpdateTimeEntryInput, TimeEntryQueryInput } from "@/validations/timeEntry"

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

  async getActive(workspaceId: string, userId: string) {
    return timeEntryRepository.findActiveByUser(workspaceId, userId)
  },

  async createManual(workspaceId: string, userId: string, input: CreateManualTimeEntryInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, clientId: input.clientId,
      taskId: input.taskId, activityCategoryId: input.categoryId,
    })

    return timeEntryRepository.createManual({
      workspaceId, userId,
      projectId: input.projectId, clientId: input.clientId, taskId: input.taskId, categoryId: input.categoryId,
      description: input.description, tags: input.tags, isBillable: input.isBillable,
      startedAt: input.startedAt, endedAt: input.endedAt,
    })
  },

  async update(id: string, workspaceId: string, scopedUserId: string | null, input: UpdateTimeEntryInput) {
    await assertWorkspaceReferences(workspaceId, {
      projectId: input.projectId, clientId: input.clientId,
      taskId: input.taskId, activityCategoryId: input.categoryId,
    })

    const data: Prisma.TimeEntryUpdateInput = {
      ...(input.projectId  !== undefined && { project:  input.projectId  ? { connect: { id: input.projectId } }  : { disconnect: true } }),
      ...(input.clientId   !== undefined && { client:   input.clientId   ? { connect: { id: input.clientId } }   : { disconnect: true } }),
      ...(input.taskId     !== undefined && { task:     input.taskId     ? { connect: { id: input.taskId } }     : { disconnect: true } }),
      ...(input.categoryId !== undefined && { category: input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true } }),
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
        if (entry.status === "RUNNING" || entry.status === "PAUSED") {
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
}
