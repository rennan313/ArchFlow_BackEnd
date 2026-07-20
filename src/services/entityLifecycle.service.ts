import { auditLog } from "@/lib/auditLog"
import { AppError, ErrorCode } from "@/lib/errors"

// ADR-020 — Entity Lifecycle. The single place that knows HOW to archive,
// restore, cancel, or physically delete a record: stamping archived/
// archivedAt/archivedBy, emitting the audit event, and returning a
// consistent not-found/already-in-that-state error. Every entity service
// that participates in the lifecycle delegates here instead of hand-rolling
// its own updateMany — the only thing that varies per entity is the guard/
// integrityCheck callback (business-specific: "does this have unarchived
// children", "is the parent archived") and which Prisma delegate to call.
//
// Deliberately NOT a class/factory bound to one model — Prisma's MongoDB
// delegates (`prisma.client`, `prisma.supplier`, ...) are structurally
// compatible with the two narrow shapes below, so passing the delegate in
// per-call keeps this file free of any per-entity knowledge.

interface UpdateManyDelegate {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
}

interface DeleteManyDelegate {
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>
}

interface BaseOpts {
  /** PascalCase entity name — e.g. "Client", "Supplier". Used for the audit
   *  event name (lowercased) and as the `entity` field on the log line. */
  entity: string
  id: string
  workspaceId: string
  userId: string
}

interface ArchiveOpts extends BaseOpts {
  delegate: UpdateManyDelegate
  /** Entity-specific block check (e.g. "has unpaid financial documents").
   *  Throw an AppError to block the archive; resolve to allow it. */
  guard?: () => Promise<void>
}

interface RestoreOpts extends BaseOpts {
  delegate: UpdateManyDelegate
  /** Entity-specific consistency check (e.g. "parent Client isn't archived").
   *  Throw an AppError to block the restore; resolve to allow it. */
  integrityCheck?: () => Promise<void>
}

interface CancelOpts extends BaseOpts {
  delegate: UpdateManyDelegate
  /** The entity-specific fields that represent "cancelled" for this model —
   *  e.g. `{ isCancelled: true }` or `{ status: "CANCELLED" }`. */
  data: Record<string, unknown>
  guard?: () => Promise<void>
  /** Audit event suffix, default "cancelled" (e.g. "lost" for an Opportunity
   *  moved to the Lost stage, which is a cancellation in spirit). */
  eventSuffix?: string
}

interface DeleteOpts extends BaseOpts {
  delegate: DeleteManyDelegate
  guard?: () => Promise<void>
}

// MEL-13 (Worklog Sprint V2) — was `entity.toLowerCase()` alone, which
// concatenates multi-word PascalCase entity names with no separator
// ("TimeEntry" → "timeentry", "ActivityCategory" → "activitycategory").
// Documented as a known, pre-existing, app-wide bug in
// WORKLOG_ARCHITECTURE_DECISIONS.md (checklist item 6) before this fix —
// affects every multi-word entity's archive/restore/cancel/delete audit
// events, not just Worklog's. Verified before fixing: entityLifecycleService
// is fully mocked in every service test that exercises it, so no test
// asserts the old (buggy) literal strings; nothing in either repo queries
// audit logs by the old names. Single-word entities (Client, Project, ...)
// are unaffected either way.
function toSnakeCase(pascalCase: string): string {
  return pascalCase.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
}

function eventName(entity: string, action: string): string {
  return `${toSnakeCase(entity)}_${action}`
}

export const entityLifecycleService = {
  /** Categoria B — soft delete. Never physically removes the row. */
  async archive(opts: ArchiveOpts): Promise<void> {
    if (opts.guard) await opts.guard()

    const res = await opts.delegate.updateMany({
      where: { id: opts.id, workspaceId: opts.workspaceId, archived: false },
      data:  { archived: true, archivedAt: new Date(), archivedBy: opts.userId },
    })
    if (res.count === 0) throw new AppError(ErrorCode.ENTITY_ALREADY_ARCHIVED)

    auditLog({
      event: eventName(opts.entity, "archived"),
      workspaceId: opts.workspaceId, userId: opts.userId,
      entity: opts.entity, entityId: opts.id,
    })
  },

  /** Inverse of archive() — resets archived/archivedAt/archivedBy. Runs
   *  `integrityCheck` first so a record is never restored into an
   *  inconsistent state (e.g. a Project whose Client is still archived). */
  async restore(opts: RestoreOpts): Promise<void> {
    if (opts.integrityCheck) await opts.integrityCheck()

    const res = await opts.delegate.updateMany({
      where: { id: opts.id, workspaceId: opts.workspaceId, archived: true },
      data:  { archived: false, archivedAt: null, archivedBy: null },
    })
    if (res.count === 0) throw new AppError(ErrorCode.ENTITY_NOT_ARCHIVED)

    auditLog({
      event: eventName(opts.entity, "restored"),
      workspaceId: opts.workspaceId, userId: opts.userId,
      entity: opts.entity, entityId: opts.id,
    })
  },

  /** Categoria C — status flips to a cancelled-equivalent state, history is
   *  preserved. `data` is entity-specific (each model names its own
   *  cancellation fields); this only centralizes the guard + audit trail. */
  async cancel(opts: CancelOpts): Promise<void> {
    if (opts.guard) await opts.guard()

    const res = await opts.delegate.updateMany({
      where: { id: opts.id, workspaceId: opts.workspaceId },
      data:  opts.data,
    })
    if (res.count === 0) throw new AppError(ErrorCode.NOT_FOUND)

    auditLog({
      event: eventName(opts.entity, opts.eventSuffix ?? "cancelled"),
      workspaceId: opts.workspaceId, userId: opts.userId,
      entity: opts.entity, entityId: opts.id,
    })
  },

  /** Categoria A — physical delete. Reserved for entities with no history
   *  value (drafts, pending invites) — see ADR-020 for the full policy on
   *  which entities this may legitimately be called for. `level: "warn"` on
   *  the audit line because a real delete is rare enough to want to stand
   *  out in a log search next to routine archive/restore/cancel events. */
  async delete(opts: DeleteOpts): Promise<void> {
    if (opts.guard) await opts.guard()

    await opts.delegate.deleteMany({ where: { id: opts.id, workspaceId: opts.workspaceId } })

    auditLog({
      event: eventName(opts.entity, "deleted"), level: "warn",
      workspaceId: opts.workspaceId, userId: opts.userId,
      entity: opts.entity, entityId: opts.id,
    })
  },
}
