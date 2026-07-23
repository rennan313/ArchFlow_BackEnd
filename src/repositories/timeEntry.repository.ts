import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import { timed } from "@/lib/metrics"
import type { TimeEntryQueryInput } from "@/validations/timeEntry"
import { toSkip } from "@/lib/pagination"

const TIME_ENTRY_INCLUDE = {
  project:  { select: { id: true, name: true } },
  client:   { select: { id: true, name: true } },
  task:     { select: { id: true, title: true } },
  category: { select: { id: true, name: true } },
} as const

interface CreateManualInput {
  workspaceId: string
  userId: string
  projectId?: string
  clientId?: string
  taskId?: string
  categoryId?: string
  description?: string
  tags?: string[]
  isBillable: boolean
  startedAt: Date
  endedAt: Date
}

export function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000))
}

export const timeEntryRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.timeEntry.findFirst({ where: { id, workspaceId }, include: TIME_ENTRY_INCLUDE })
  },

  // scopedUserId: non-null forces the filter to that user (a caller without
  // view:time-entries, resolved at the route layer — ADR-022, services never
  // import rbac.ts); null means the caller has view:time-entries and may
  // optionally filter by query.userId, or see the whole workspace if omitted.
  async findMany(workspaceId: string, query: TimeEntryQueryInput, scopedUserId: string | null) {
    const { page, limit, projectId, clientId, categoryId, from, to, archived, sortBy, sortOrder } = query
    const skip = toSkip(page, limit)
    const effectiveUserId = scopedUserId ?? query.userId

    const where: Prisma.TimeEntryWhereInput = {
      workspaceId,
      ...(effectiveUserId && { userId: effectiveUserId }),
      archived,
      ...(projectId  && { projectId }),
      ...(clientId   && { clientId }),
      ...(categoryId && { categoryId }),
      ...((from || to) && { startedAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    }

    const [data, total] = await Promise.all([
      prisma.timeEntry.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder }, include: TIME_ENTRY_INCLUDE }),
      prisma.timeEntry.count({ where }),
    ])
    return { data, total }
  },

  // ADR-026 (Worklog V3) — "Atividades Pendentes" is a derived view over
  // TimeEntry, never a separate collection. Pending = closed entry (never an
  // OPEN Step — that's "in progress", not "pending organization") missing
  // projectId or categoryId. description being empty is deliberately NOT
  // part of the criterion (see the ADR) — a bare quick-start shouldn't
  // inflate the count.
  async findPending(workspaceId: string, scopedUserId: string | null, page: number, limit: number) {
    const skip = toSkip(page, limit)
    const where: Prisma.TimeEntryWhereInput = {
      workspaceId,
      archived: false,
      status: "COMPLETED",
      ...(scopedUserId && { userId: scopedUserId }),
      OR: [{ projectId: null }, { categoryId: null }],
    }

    const [data, total] = await Promise.all([
      prisma.timeEntry.findMany({ where, skip, take: limit, orderBy: { startedAt: "desc" }, include: TIME_ENTRY_INCLUDE }),
      prisma.timeEntry.count({ where }),
    ])
    return { data, total }
  },

  countPending(workspaceId: string, scopedUserId: string | null) {
    return prisma.timeEntry.count({
      where: {
        workspaceId,
        archived: false,
        status: "COMPLETED",
        ...(scopedUserId && { userId: scopedUserId }),
        OR: [{ projectId: null }, { categoryId: null }],
      },
    })
  },

  // The Steps of a single WorkSession, in chronological order — feeds the
  // post-finish() review screen (ADR-024/worklog-v3-adr.md §8).
  findByWorkSession(workSessionId: string, workspaceId: string) {
    return prisma.timeEntry.findMany({
      where: { workSessionId, workspaceId, archived: false },
      orderBy: { startedAt: "asc" },
      include: TIME_ENTRY_INCLUDE,
    })
  },

  async createManual(input: CreateManualInput, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId: input.workspaceId, userId: input.userId, entity: "TimeEntry", op: "createManual" }

    return timed("worklog.createManual", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.create({
        data: {
          workspaceId: input.workspaceId,
          userId:      input.userId,
          projectId:   input.projectId,
          clientId:    input.clientId,
          taskId:      input.taskId,
          categoryId:  input.categoryId,
          description: input.description,
          tags:        input.tags ?? [],
          isBillable:  input.isBillable,
          status:      "COMPLETED",
          source:      "MANUAL",
          startedAt:   input.startedAt,
          endedAt:     input.endedAt,
          durationSeconds: secondsBetween(input.startedAt, input.endedAt),
        },
        include: TIME_ENTRY_INCLUDE,
      })

      auditLog({ ...base, event: "time_entry_created", entityId: entry.id, durationSeconds: entry.durationSeconds })
      return entry
    }), { context: base }))
  },

  // Metadata-only update (description/tags/project/client/task/category/
  // isBillable) — never touches status/startedAt/endedAt/durationSeconds.
  // scopedUserId narrows to the caller's own entry unless the caller has
  // view:time-entries (service passes null in that case) — ADR-022.
  // `data` is typed as the updateMany-only mutation input (scalar FK fields
  // like projectId, never a nested `{ connect }`) deliberately — Prisma
  // rejects relation writes inside updateMany() with a
  // PrismaClientValidationError, and TypeScript won't catch a caller passing
  // the wrong (single-record) `Prisma.TimeEntryUpdateInput` shape here unless
  // this parameter is pinned to the type updateMany actually accepts.
  update(id: string, workspaceId: string, scopedUserId: string | null, data: Prisma.TimeEntryUncheckedUpdateManyInput) {
    return prisma.timeEntry.updateMany({
      where: { id, workspaceId, ...(scopedUserId && { userId: scopedUserId }) },
      data,
    })
  },

  // ADR-026 — bulk association used by the pending-activities / post-finish
  // review screens ("associar projeto em lote"). Each id is scoped
  // independently the same way update() is; ids the caller doesn't own (when
  // scopedUserId is set) or that don't belong to the workspace are silently
  // excluded from the count, same shape as a Prisma updateMany over a
  // filtered where — the caller only learns "N of M applied" via the count.
  bulkUpdate(ids: string[], workspaceId: string, scopedUserId: string | null, data: Prisma.TimeEntryUncheckedUpdateManyInput) {
    return prisma.timeEntry.updateMany({
      where: { id: { in: ids }, workspaceId, ...(scopedUserId && { userId: scopedUserId }) },
      data,
    })
  },

  // Fase 2A — feeds worklogSummary.service.ts#computeProjectSummary. Only
  // COMPLETED, non-archived entries count toward totals (a currently OPEN
  // Step's durationSeconds is null until it closes). scopedUserId narrows to
  // the caller's own entries when they lack view:time-entries (ADR-022),
  // same convention as findMany above. Weekly evolution isn't grouped
  // natively here — Mongo has no date_trunc equivalent reachable through
  // Prisma's groupBy, and a single project's entry volume is small enough
  // to bucket by week in the service layer (same exception
  // financialDashboard.service.ts already takes for cross-cutting reads).
  async aggregateByProject(projectId: string, workspaceId: string, scopedUserId: string | null) {
    const where: Prisma.TimeEntryWhereInput = {
      workspaceId, projectId, archived: false, status: "COMPLETED",
      ...(scopedUserId && { userId: scopedUserId }),
    }

    const [byBillable, byCategory, byUser, entries] = await Promise.all([
      prisma.timeEntry.groupBy({ by: ["isBillable"], where, _sum: { durationSeconds: true } }),
      prisma.timeEntry.groupBy({ by: ["categoryId"], where, _sum: { durationSeconds: true } }),
      prisma.timeEntry.groupBy({ by: ["userId"], where, _sum: { durationSeconds: true } }),
      prisma.timeEntry.findMany({ where, select: { startedAt: true, durationSeconds: true } }),
    ])

    return { byBillable, byCategory, byUser, entries }
  },

  // Fase 2A — feeds the batch worklog indicators merged into
  // GET /api/projects/:id/tasks (taskService.listByProject). One groupBy for
  // all tasks in the project instead of one query per task (N+1).
  async aggregateByTasks(taskIds: string[], workspaceId: string) {
    if (taskIds.length === 0) return { totals: [], lastEntries: [] }

    const where: Prisma.TimeEntryWhereInput = { workspaceId, taskId: { in: taskIds }, archived: false }

    const [totals, lastEntries] = await Promise.all([
      prisma.timeEntry.groupBy({ by: ["taskId"], where: { ...where, status: "COMPLETED" }, _sum: { durationSeconds: true } }),
      prisma.timeEntry.findMany({
        where, orderBy: { startedAt: "desc" },
        select: { taskId: true, startedAt: true, status: true, userId: true },
      }),
    ])

    return { totals, lastEntries }
  },
}
