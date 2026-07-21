import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import { timed, incrementCounter } from "@/lib/metrics"

const STEP_INCLUDE = {
  project:  { select: { id: true, name: true } },
  client:   { select: { id: true, name: true } },
  task:     { select: { id: true, title: true } },
  category: { select: { id: true, name: true } },
} as const

interface StepContext {
  projectId?: string
  clientId?: string
  taskId?: string
  categoryId?: string
  description?: string
  tags?: string[]
  isBillable?: boolean
}

interface StartInput extends StepContext {
  workspaceId: string
  userId: string
  isBillable: boolean
  startSource?: string
}

// MEL-16-equivalent for WorkSession (ADR-028) — same threshold the V2 timer
// already warns at (timeEntry.repository.ts pre-V3), now checked against the
// dominant clock (WorkSession) instead of a single TimeEntry. Never blocks.
const LONG_SESSION_THRESHOLD_SECONDS = 12 * 3600

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000))
}

export const workSessionRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.workSession.findFirst({ where: { id, workspaceId } })
  },

  /** The caller's own active (RUNNING/PAUSED) session, if any, with its
   *  currently open Step — the read path used both by GET /work-sessions/active
   *  (widget reconciliation) and by every mutation below to resolve "my
   *  active session" without requiring an id from the client. */
  async findActiveByUser(workspaceId: string, userId: string) {
    const session = await prisma.workSession.findFirst({
      where: { workspaceId, userId, status: { in: ["RUNNING", "PAUSED"] } },
    })
    if (!session) return null
    const openStep = await prisma.timeEntry.findFirst({
      where: { workSessionId: session.id, status: "OPEN" },
      include: STEP_INCLUDE,
    })
    return { session, openStep }
  },

  // ADR-024 — the only non-idempotent, no-prior-id operation of this
  // aggregate, same shape as timeEntry.repository.ts#start pre-V3. Creates
  // the WorkSession and its first Step in one transaction. Serialized by the
  // manually-created sparse unique index on activeOwnerId (docs/indexes.md)
  // — a second start() for the same user collides on that index and
  // surfaces as P2002 here, not as a lost update.
  async start(input: StartInput, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId: input.workspaceId, userId: input.userId, entity: "WorkSession", op: "start" }
    const now = new Date()

    try {
      return await timed("worklog.workSession.start", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const session = await tx.workSession.create({
          data: {
            workspaceId: input.workspaceId,
            userId:      input.userId,
            status:      "RUNNING",
            startedAt:     now,
            lastResumedAt: now,
            pausedAccumSec: 0,
            activeOwnerId:  input.userId,
          },
        })

        const step = await tx.timeEntry.create({
          data: {
            workspaceId: input.workspaceId,
            userId:      input.userId,
            workSessionId: session.id,
            projectId:   input.projectId,
            clientId:    input.clientId,
            taskId:      input.taskId,
            categoryId:  input.categoryId,
            description: input.description,
            tags:        input.tags ?? [],
            isBillable:  input.isBillable,
            status:      "OPEN",
            source:      "TIMER",
            startedAt:   now,
          },
          include: STEP_INCLUDE,
        })

        if (input.startSource) incrementCounter(`worklog.workSession.start.source.${input.startSource}`)
        auditLog({ ...base, event: "work_session_started", entityId: session.id, startSource: input.startSource })
        return { session, openStep: step }
      }), { context: base }))
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        auditLog({ ...base, level: "warn", event: "work_session_already_running_rejected" })
        const active = await this.findActiveByUser(input.workspaceId, input.userId)
        throw new AppError(ErrorCode.TIMER_ALREADY_RUNNING, active ? JSON.stringify({ activeSessionId: active.session.id }) : undefined)
      }
      if (!(error instanceof AppError)) {
        auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      }
      throw error
    }
  },

  // "+ Nova Atividade" (ADR-024) — closes the currently open Step and opens a
  // new one, in one transaction. The WorkSession clock (lastResumedAt) is
  // never touched — the total keeps counting uninterrupted, only the
  // per-activity clock resets. Requires the session to be RUNNING (a PAUSED
  // session has no open Step to switch away from — resume() first).
  async switchContext(workspaceId: string, userId: string, next: StepContext, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "WorkSession", op: "switchContext" }
    const now = new Date()

    return timed("worklog.workSession.switchContext", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const session = await tx.workSession.findFirst({ where: { workspaceId, userId, status: "RUNNING" } })
      if (!session) throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)

      const openStep = await tx.timeEntry.findFirst({ where: { workSessionId: session.id, status: "OPEN" } })
      if (openStep) {
        await tx.timeEntry.updateMany({
          where: { id: openStep.id, status: "OPEN" },
          data:  { status: "COMPLETED", endedAt: now, durationSeconds: secondsBetween(openStep.startedAt, now) },
        })
      }

      const step = await tx.timeEntry.create({
        data: {
          workspaceId, userId,
          workSessionId: session.id,
          projectId:   next.projectId,
          clientId:    next.clientId,
          taskId:      next.taskId,
          categoryId:  next.categoryId,
          description: next.description,
          tags:        next.tags ?? [],
          isBillable:  next.isBillable ?? true,
          status:      "OPEN",
          source:      "TIMER",
          startedAt:   now,
        },
        include: STEP_INCLUDE,
      })

      auditLog({ ...base, event: "work_session_activity_switched", entityId: session.id, previousStepId: openStep?.id, newStepId: step.id })
      return { session, openStep: step }
    }), { context: base }))
  },

  // CAS: only a RUNNING session owned by this user can be paused. Closes the
  // open Step (if any) and folds the current span into pausedAccumSec — same
  // convergent-transition shape as the pre-V3 TimeEntry.pause().
  async pause(workspaceId: string, userId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "WorkSession", op: "pause" }
    const now = new Date()

    return timed("worklog.workSession.pause", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const session = await tx.workSession.findFirst({ where: { workspaceId, userId, status: "RUNNING" } })
      if (!session) throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)

      const openStep = await tx.timeEntry.findFirst({ where: { workSessionId: session.id, status: "OPEN" } })
      if (openStep) {
        await tx.timeEntry.updateMany({
          where: { id: openStep.id, status: "OPEN" },
          data:  { status: "COMPLETED", endedAt: now, durationSeconds: secondsBetween(openStep.startedAt, now) },
        })
      }

      const span = secondsBetween(session.lastResumedAt ?? session.startedAt, now)
      const cas = await tx.workSession.updateMany({
        where: { id: session.id, status: "RUNNING" },
        data:  { status: "PAUSED", pausedAccumSec: session.pausedAccumSec + span, lastResumedAt: null },
      })
      if (cas.count === 0) throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)

      auditLog({ ...base, event: "work_session_paused", entityId: session.id })
      return tx.workSession.findFirstOrThrow({ where: { id: session.id } })
    }), { context: base }))
  },

  // CAS: only a PAUSED session owned by this user can be resumed. Starts a
  // new running span (lastResumedAt = now) and opens a fresh, blank Step —
  // the user picks context for it same as any other new activity (never
  // silently reuses the pre-pause context, DP3's "never absorb silently"
  // spirit applied here too).
  async resume(workspaceId: string, userId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "WorkSession", op: "resume" }
    const now = new Date()

    return timed("worklog.workSession.resume", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const session = await tx.workSession.findFirst({ where: { workspaceId, userId, status: "PAUSED" } })
      if (!session) throw new AppError(ErrorCode.TIMER_NOT_PAUSED)

      const cas = await tx.workSession.updateMany({
        where: { id: session.id, status: "PAUSED" },
        data:  { status: "RUNNING", lastResumedAt: now },
      })
      if (cas.count === 0) throw new AppError(ErrorCode.TIMER_NOT_PAUSED)

      const step = await tx.timeEntry.create({
        data: {
          workspaceId, userId,
          workSessionId: session.id,
          status: "OPEN", source: "TIMER", isBillable: true,
          startedAt: now,
        },
        include: STEP_INCLUDE,
      })

      auditLog({ ...base, event: "work_session_resumed", entityId: session.id, newStepId: step.id })
      return { session: await tx.workSession.findFirstOrThrow({ where: { id: session.id } }), openStep: step }
    }), { context: base }))
  },

  // CAS: RUNNING or PAUSED → COMPLETED. Closes the open Step if the session
  // is RUNNING (nothing to close if already PAUSED — pause() already closed
  // it). DP5: when finishing from PAUSED, endedAt is the last Step's own
  // endedAt (when work actually stopped), not the instant of this call.
  async finish(workspaceId: string, userId: string, correlationId = newCorrelationId()) {
    const base = { correlationId, workspaceId, userId, entity: "WorkSession", op: "finish" }
    const now = new Date()

    return timed("worklog.workSession.finish", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const session = await tx.workSession.findFirst({ where: { workspaceId, userId, status: { in: ["RUNNING", "PAUSED"] } } })
      if (!session) throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)

      let finalSpan = 0
      let endedAt = now

      if (session.status === "RUNNING") {
        const openStep = await tx.timeEntry.findFirst({ where: { workSessionId: session.id, status: "OPEN" } })
        if (openStep) {
          await tx.timeEntry.updateMany({
            where: { id: openStep.id, status: "OPEN" },
            data:  { status: "COMPLETED", endedAt: now, durationSeconds: secondsBetween(openStep.startedAt, now) },
          })
        }
        finalSpan = secondsBetween(session.lastResumedAt ?? session.startedAt, now)
      } else {
        // PAUSED — DP5: end-of-period is the last activity's own end, not now.
        const lastStep = await tx.timeEntry.findFirst({
          where: { workSessionId: session.id, status: "COMPLETED" },
          orderBy: { endedAt: "desc" },
        })
        endedAt = lastStep?.endedAt ?? session.startedAt
      }

      const durationSeconds = session.pausedAccumSec + finalSpan

      const cas = await tx.workSession.updateMany({
        where: { id: session.id, status: { in: ["RUNNING", "PAUSED"] } },
        data:  {
          status: "COMPLETED",
          endedAt,
          durationSeconds,
          pausedAccumSec: durationSeconds,
          lastResumedAt: null,
          activeOwnerId: null,
        },
      })
      if (cas.count === 0) throw new AppError(ErrorCode.TIMER_NOT_ACTIVE)

      const longSession = durationSeconds >= LONG_SESSION_THRESHOLD_SECONDS
      if (longSession) incrementCounter("worklog.workSession.finish.long_duration")
      auditLog({ ...base, event: "work_session_finished", entityId: session.id, durationSeconds, longSession })
      return tx.workSession.findFirstOrThrow({ where: { id: session.id } })
    }), { context: base }))
  },
}
