import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import { timed, incrementCounter } from "@/lib/metrics"
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

interface StartTimerInput {
  workspaceId: string
  userId: string
  projectId?: string
  clientId?: string
  taskId?: string
  categoryId?: string
  description?: string
  tags?: string[]
  isBillable: boolean
  // MEL-16 — telemetry-only, never written to TimeEntry (see the schema
  // comment in validations/timeEntry.ts).
  startSource?: string
}

// Mirrors purchaseOrder.repository.ts#isUniqueConstraintViolation — same
// Prisma error code, different index (the manually-created sparse unique
// index on activeOwnerId, docs/indexes.md, not a Prisma-declared @unique).
function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000))
}

// MEL-16 (observability) — matches the frontend's identical constant
// (ArchFlow/src/lib/duration.ts#LONG_TIMER_THRESHOLD_SECONDS), which drives
// the "ajustar ou manter" confirmation before finishing a long timer
// (MEL-11). Kept in sync manually — the two repos can't share code. Used
// here only to flag the completed entry in the audit log/metrics; stop()
// itself never limits or blocks on this (Sprint V2 decision #4).
const LONG_TIMER_THRESHOLD_SECONDS = 12 * 3600

export const timeEntryRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.timeEntry.findFirst({ where: { id, workspaceId }, include: TIME_ENTRY_INCLUDE })
  },

  /** The caller's own active (RUNNING/PAUSED) timer, if any — the read path
   *  used both by GET /time-entries/active (widget reconciliation) and by
   *  start()'s conflict-recovery branch below. */
  findActiveByUser(workspaceId: string, userId: string) {
    return prisma.timeEntry.findFirst({
      where: { workspaceId, userId, status: { in: ["RUNNING", "PAUSED"] } },
      include: TIME_ENTRY_INCLUDE,
    })
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

  // ADR-021 — the only non-idempotent, no-prior-id operation of this
  // aggregate (mirrors PurchaseOrder.create()'s idempotencyKey shape, but
  // rejects the second concurrent intent instead of replaying the first:
  // "another timer" is a genuinely different request, not a resubmit).
  // Serialized by the manually-created sparse unique index on
  // activeOwnerId (docs/indexes.md) — a second start() for the same user
  // collides on that index and surfaces as P2002 here, not as a lost update.
  async start(input: StartTimerInput, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId: input.workspaceId, userId: input.userId, entity: "TimeEntry", op: "start" }
    const now = new Date()

    try {
      return await timed("worklog.start", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
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
            status:      "RUNNING",
            source:      "TIMER",
            startedAt:     now,
            lastResumedAt: now,
            pausedAccumSec: 0,
            activeOwnerId:  input.userId,
          },
          include: TIME_ENTRY_INCLUDE,
        })

        // MEL-16 — startSource is telemetry-only (see StartTimerInput above),
        // never part of the `data` written to TimeEntry.
        if (input.startSource) incrementCounter(`worklog.start.source.${input.startSource}`)
        auditLog({ ...base, event: "time_entry_started", entityId: entry.id, startSource: input.startSource })
        return entry
      }), { context: base }))
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        auditLog({ ...base, level: "warn", event: "timer_already_running_rejected" })
        const active = await this.findActiveByUser(input.workspaceId, input.userId)
        throw new AppError(ErrorCode.TIMER_ALREADY_RUNNING, active ? JSON.stringify({ activeEntryId: active.id }) : undefined)
      }
      if (!(error instanceof AppError)) {
        auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      }
      throw error
    }
  },

  // CAS: only a RUNNING entry owned by this user can be paused. Folds the
  // current span (now - lastResumedAt) into pausedAccumSec — same
  // convergent-transition shape as purchaseOrder.repository.ts#approve.
  async pause(id: string, workspaceId: string, userId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "TimeEntry", entityId: id, op: "pause" }

    return timed("worklog.pause", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const current = await tx.timeEntry.findFirst({ where: { id, workspaceId, userId, status: "RUNNING" } })
      if (!current) {
        const exists = await tx.timeEntry.findFirst({ where: { id, workspaceId, userId } })
        if (!exists) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
        throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)
      }

      const span = secondsBetween(current.lastResumedAt ?? current.startedAt, new Date())

      const cas = await tx.timeEntry.updateMany({
        where: { id, workspaceId, userId, status: "RUNNING" },
        data:  { status: "PAUSED", pausedAccumSec: current.pausedAccumSec + span, lastResumedAt: null },
      })
      if (cas.count === 0) throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)

      auditLog({ ...base, event: "time_entry_paused" })
      return tx.timeEntry.findFirstOrThrow({ where: { id }, include: TIME_ENTRY_INCLUDE })
    }), { context: base }))
  },

  // CAS: only a PAUSED entry owned by this user can be resumed. Starts a new
  // running span (lastResumedAt = now); pausedAccumSec is untouched until
  // the next pause()/stop() folds this span in.
  async resume(id: string, workspaceId: string, userId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "TimeEntry", entityId: id, op: "resume" }

    return timed("worklog.resume", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const cas = await tx.timeEntry.updateMany({
        where: { id, workspaceId, userId, status: "PAUSED" },
        data:  { status: "RUNNING", lastResumedAt: new Date() },
      })
      if (cas.count === 0) {
        const exists = await tx.timeEntry.findFirst({ where: { id, workspaceId, userId } })
        if (!exists) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
        throw new AppError(ErrorCode.TIMER_NOT_PAUSED)
      }

      auditLog({ ...base, event: "time_entry_resumed" })
      return tx.timeEntry.findFirstOrThrow({ where: { id }, include: TIME_ENTRY_INCLUDE })
    }), { context: base }))
  },

  // CAS: RUNNING or PAUSED → COMPLETED. Computes durationSeconds server-side
  // (pausedAccumSec + the final RUNNING span, if any) and clears
  // activeOwnerId in the same transaction — the entry stops being "active"
  // atomically with the duration becoming final.
  async stop(id: string, workspaceId: string, userId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "TimeEntry", entityId: id, op: "stop" }
    const now = new Date()

    return timed("worklog.stop", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const current = await tx.timeEntry.findFirst({ where: { id, workspaceId, userId, status: { in: ["RUNNING", "PAUSED"] } } })
      if (!current) {
        const exists = await tx.timeEntry.findFirst({ where: { id, workspaceId, userId } })
        if (!exists) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
        throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)
      }

      const finalSpan = current.status === "RUNNING" ? secondsBetween(current.lastResumedAt ?? current.startedAt, now) : 0
      const durationSeconds = current.pausedAccumSec + finalSpan

      const cas = await tx.timeEntry.updateMany({
        where: { id, workspaceId, userId, status: { in: ["RUNNING", "PAUSED"] } },
        data:  {
          status: "COMPLETED",
          endedAt: now,
          durationSeconds,
          pausedAccumSec: durationSeconds,
          lastResumedAt: null,
          activeOwnerId: null,
        },
      })
      if (cas.count === 0) throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)

      // MEL-16 — flags entries finished at/above the same threshold that
      // triggers the frontend's "ajustar ou manter" prompt (MEL-11), so how
      // often that actually happens is visible without re-deriving it from
      // raw durations later. Never blocks/limits stop() itself.
      const longDuration = durationSeconds >= LONG_TIMER_THRESHOLD_SECONDS
      if (longDuration) incrementCounter("worklog.stop.long_duration")
      auditLog({ ...base, event: "time_entry_stopped", durationSeconds, longDuration })
      return tx.timeEntry.findFirstOrThrow({ where: { id }, include: TIME_ENTRY_INCLUDE })
    }), { context: base }))
  },

  // Metadata-only update (description/tags/project/client/task/category/
  // isBillable) — never touches status/startedAt/endedAt/durationSeconds.
  // scopedUserId narrows to the caller's own entry unless the caller has
  // view:time-entries (service passes null in that case) — ADR-022.
  update(id: string, workspaceId: string, scopedUserId: string | null, data: Prisma.TimeEntryUpdateInput) {
    return prisma.timeEntry.updateMany({
      where: { id, workspaceId, ...(scopedUserId && { userId: scopedUserId }) },
      data,
    })
  },

  // Fase 2A — feeds worklogSummary.service.ts#computeProjectSummary. Only
  // COMPLETED, non-archived entries count toward totals (a RUNNING/PAUSED
  // entry's durationSeconds is null until stop()). scopedUserId narrows to
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
