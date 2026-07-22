import { prisma } from "@/lib/prisma"
import type { PrismaTransactionClient } from "@/lib/prisma"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"

// Entitlements Sprint (2026-07) — running storage-usage counter, replacing
// the old rough estimate (mediaCount × 2MB) in
// subscription.service.ts#canUploadFile. Same CAS shape as
// purchaseOrder.repository.ts's approve()/cancel(): a conditional
// `updateMany` with the limit as a precondition, count===0 means "would
// exceed", never a plain findFirst-then-update read-modify-write.

// Internal-only marker — thrown inside the caller's transaction to signal
// "would exceed the limit"; the calling service (storageUsage.service.ts)
// catches it and returns a structured LimitCheckResult instead of throwing
// to the route layer.
export class StorageLimitExceededError extends Error {}

export const workspaceUsageRepository = {
  getUsedBytes(workspaceId: string) {
    return prisma.workspaceUsage.findUnique({ where: { workspaceId } })
      .then((row) => row?.storageUsedBytes ?? 0n)
  },

  // Ensure-exists helper — WorkspaceUsage rows are created lazily on first
  // upload/reconciliation rather than eagerly for every workspace.
  async ensure(tx: PrismaTransactionClient, workspaceId: string) {
    return tx.workspaceUsage.upsert({
      where: { workspaceId },
      create: { workspaceId, storageUsedBytes: 0n },
      update: {},
    })
  },

  // Must be called from INSIDE the same transaction as the actual upload
  // write (media/document create) — throws StorageLimitExceededError (never
  // returns a false-y sentinel) so the caller's transaction rolls back the
  // whole upload atomically if the reservation fails, never leaving an
  // orphaned file record with no counted storage.
  async reserveAndIncrement(
    tx: PrismaTransactionClient,
    workspaceId: string,
    deltaBytes: bigint,
    limitBytes: bigint, // BigInt(-1) sentinel = unlimited, skips the CAS precondition entirely
  ): Promise<void> {
    await this.ensure(tx, workspaceId)

    if (limitBytes === -1n) {
      await tx.workspaceUsage.update({
        where: { workspaceId },
        data: { storageUsedBytes: { increment: deltaBytes }, version: { increment: 1 } },
      })
      return
    }

    const cas = await tx.workspaceUsage.updateMany({
      where: { workspaceId, storageUsedBytes: { lte: limitBytes - deltaBytes } },
      data: { storageUsedBytes: { increment: deltaBytes }, version: { increment: 1 } },
    })
    if (cas.count === 0) throw new StorageLimitExceededError()
  },

  // No limit check on delete — freeing space never fails.
  async decrement(tx: PrismaTransactionClient, workspaceId: string, deltaBytes: bigint): Promise<void> {
    await this.ensure(tx, workspaceId)
    await tx.workspaceUsage.updateMany({
      where: { workspaceId },
      data: { storageUsedBytes: { decrement: deltaBytes }, version: { increment: 1 } },
    })
  },

  // Nightly reconciliation backstop — recomputes the true SUM from
  // ProposalMedia.sizeBytes + DocumentVersion.size and corrects drift. Never
  // the primary read path (too slow to run on every upload check); the
  // running counter above is.
  async reconcileWorkspace(workspaceId: string): Promise<{ before: bigint; after: bigint; drift: bigint }> {
    const correlationId = newCorrelationId()
    const base = { correlationId, workspaceId, entity: "WorkspaceUsage", op: "reconcile" }

    return withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const before = (await this.ensure(tx, workspaceId)).storageUsedBytes

      const [mediaSum, versionSum] = await Promise.all([
        tx.proposalMedia.aggregate({
          where: { proposal: { workspaceId } },
          _sum: { sizeBytes: true },
        }),
        tx.documentVersion.aggregate({
          where: { document: { workspaceId } },
          _sum: { size: true },
        }),
      ])
      const after = BigInt(mediaSum._sum.sizeBytes ?? 0) + BigInt(versionSum._sum.size ?? 0)
      const drift = after - before

      await tx.workspaceUsage.update({
        where: { workspaceId },
        data: { storageUsedBytes: after, version: { increment: 1 } },
      })

      if (drift !== 0n) {
        auditLog({ ...base, level: drift > 1_000_000n || drift < -1_000_000n ? "warn" : "info", event: "storage_usage_reconciled", before: before.toString(), after: after.toString(), drift: drift.toString() })
      }

      return { before, after, drift }
    }), { context: base })
  },
}
