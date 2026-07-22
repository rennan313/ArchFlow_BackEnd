import { AppError, ErrorCode } from "@/lib/errors"
import { workspaceUsageRepository, StorageLimitExceededError } from "@/repositories/workspaceUsage.repository"
import type { PrismaTransactionClient } from "@/lib/prisma"

// Entitlements Sprint (2026-07) — thin service wrapper over
// workspaceUsage.repository.ts. Converts the repository's internal
// StorageLimitExceededError (a plain Error, used only to trigger a
// transaction rollback) into the app's normal AppError/ErrorCode contract
// for anything outside the repository layer.

export const storageUsageService = {
  getUsedBytes(workspaceId: string): Promise<bigint> {
    return workspaceUsageRepository.getUsedBytes(workspaceId)
  },

  // Call from INSIDE the same transaction as the actual media/document
  // create — this is the race-safe backstop behind limitService.
  // canUploadFile's cheap pre-flight check, not a replacement for it (the
  // pre-flight gives good UX with a fast 403 before any upload starts; this
  // is what actually prevents two concurrent uploads from both squeezing
  // past the limit).
  async reserveAndIncrement(tx: PrismaTransactionClient, workspaceId: string, deltaBytes: number, limitBytes: bigint): Promise<void> {
    try {
      await workspaceUsageRepository.reserveAndIncrement(tx, workspaceId, BigInt(deltaBytes), limitBytes)
    } catch (error) {
      if (error instanceof StorageLimitExceededError) throw new AppError(ErrorCode.BILLING_STORAGE_LIMIT_EXCEEDED)
      throw error
    }
  },

  decrement(tx: PrismaTransactionClient, workspaceId: string, deltaBytes: number): Promise<void> {
    return workspaceUsageRepository.decrement(tx, workspaceId, BigInt(deltaBytes))
  },

  // Nightly cron backstop (Phase 3/4 wiring) — real SUM, corrects drift.
  reconcileWorkspace(workspaceId: string) {
    return workspaceUsageRepository.reconcileWorkspace(workspaceId)
  },
}
