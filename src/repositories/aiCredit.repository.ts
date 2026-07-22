import { Prisma, type CreditBucket } from "@prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import { timed } from "@/lib/metrics"

// Entitlements Sprint (2026-07) — AI credit ledger + materialized balance.
// Mirrors two proven concurrency patterns already in this codebase, not a
// new primitive:
//   - idempotency-key-first-inside-transaction + @unique-as-final-safety-net
//     (installment.repository.ts#registerPayment)
//   - CAS `updateMany({ where: { ...id, precondition } })` for atomic
//     conditional decrement (purchaseOrder.repository.ts#approve/cancel)
//
// Debit is split per-bucket (PLAN first, PURCHASED for the remainder) because
// AiCreditBalance is itself keyed per (workspaceId, bucket) — a debit that
// spans both buckets produces two ledger rows, sharing a derived idempotency
// key (`${key}:PLAN` / `${key}:PURCHASED`) so the whole operation replays
// idempotently as a unit even though it touches two rows.

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

// Internal-only — thrown inside the $transaction callback to trigger a clean
// rollback when neither bucket has enough balance; never escapes debit().
class InsufficientCreditsError extends Error {}

// A DEBIT ledger entry's `amount` is always negative; this recovers the
// positive magnitude for a replay's result shape. Math.abs (not unary `-`)
// deliberately — `-(0)` produces `-0`, which fails a strict `toEqual(0)`
// assertion even though it's numerically equal.
function debitedAmountFrom(entries: { bucket: CreditBucket; amount: number }[], bucket: CreditBucket): number {
  return Math.abs(entries.find((e) => e.bucket === bucket)?.amount ?? 0)
}

export interface DebitInput {
  workspaceId: string
  cost: number
  idempotencyKey: string
  relatedOperation?: string
  relatedEntityId?: string
  correlationId?: string
}

export interface DebitOutcome {
  success: boolean
  ledgerEntryIds: string[]
  planDebited: number
  purchasedDebited: number
}

async function bucketBalance(
  tx: PrismaTransactionClient,
  workspaceId: string,
  bucket: CreditBucket,
) {
  return tx.aiCreditBalance.findUnique({ where: { workspaceId_bucket: { workspaceId, bucket } } })
}

export const aiCreditRepository = {
  async getBalances(workspaceId: string): Promise<{ plan: number; purchased: number }> {
    const rows = await prisma.aiCreditBalance.findMany({ where: { workspaceId } })
    return {
      plan: rows.find((r) => r.bucket === "PLAN")?.balance ?? 0,
      purchased: rows.find((r) => r.bucket === "PURCHASED")?.balance ?? 0,
    }
  },

  findLedgerEntry(id: string) {
    return prisma.aiCreditLedgerEntry.findUnique({ where: { id } })
  },

  // Plan-bucket first, then purchased, atomic, idempotent-by-construction.
  // Never partially debits: if the combined balance across both buckets is
  // short, the whole transaction rolls back and nothing is written.
  async debit(input: DebitInput): Promise<DebitOutcome> {
    const correlationId = input.correlationId ?? newCorrelationId()
    const base = { correlationId, workspaceId: input.workspaceId, entity: "AiCreditLedgerEntry", op: "debit" }
    const idKeyPlan = `${input.idempotencyKey}:PLAN`
    const idKeyPurchased = `${input.idempotencyKey}:PURCHASED`

    try {
      return await timed("billing.aiCredit.debit", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const existing = await tx.aiCreditLedgerEntry.findMany({
          where: { idempotencyKey: { in: [idKeyPlan, idKeyPurchased] } },
        })
        if (existing.length > 0) {
          return {
            success: true,
            ledgerEntryIds: existing.map((e) => e.id),
            planDebited: debitedAmountFrom(existing, "PLAN"),
            purchasedDebited: debitedAmountFrom(existing, "PURCHASED"),
          }
        }

        let remaining = input.cost
        const ledgerEntryIds: string[] = []
        let planDebited = 0
        let purchasedDebited = 0

        const planBalance = await bucketBalance(tx, input.workspaceId, "PLAN")
        const takeFromPlan = Math.min(remaining, planBalance?.balance ?? 0)
        if (takeFromPlan > 0) {
          const cas = await tx.aiCreditBalance.updateMany({
            where: { workspaceId: input.workspaceId, bucket: "PLAN", balance: { gte: takeFromPlan } },
            data: { balance: { decrement: takeFromPlan }, version: { increment: 1 } },
          })
          if (cas.count > 0) {
            const updated = await bucketBalance(tx, input.workspaceId, "PLAN")
            const entry = await tx.aiCreditLedgerEntry.create({
              data: {
                workspaceId: input.workspaceId, bucket: "PLAN", reason: "DEBIT", amount: -takeFromPlan,
                balanceAfter: updated?.balance ?? 0, idempotencyKey: idKeyPlan,
                relatedOperation: input.relatedOperation, relatedEntityId: input.relatedEntityId,
              },
            })
            ledgerEntryIds.push(entry.id)
            planDebited = takeFromPlan
            remaining -= takeFromPlan
          }
        }

        if (remaining > 0) {
          const cas = await tx.aiCreditBalance.updateMany({
            where: { workspaceId: input.workspaceId, bucket: "PURCHASED", balance: { gte: remaining } },
            data: { balance: { decrement: remaining }, version: { increment: 1 } },
          })
          if (cas.count === 0) throw new InsufficientCreditsError()

          const updated = await bucketBalance(tx, input.workspaceId, "PURCHASED")
          const entry = await tx.aiCreditLedgerEntry.create({
            data: {
              workspaceId: input.workspaceId, bucket: "PURCHASED", reason: "DEBIT", amount: -remaining,
              balanceAfter: updated?.balance ?? 0, idempotencyKey: idKeyPurchased,
              relatedOperation: input.relatedOperation, relatedEntityId: input.relatedEntityId,
            },
          })
          ledgerEntryIds.push(entry.id)
          purchasedDebited = remaining
          remaining = 0
        }

        auditLog({ ...base, event: "ai_credits_debited", planDebited, purchasedDebited, operation: input.relatedOperation })
        return { success: true, ledgerEntryIds, planDebited, purchasedDebited }
      }), { context: base }))
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        auditLog({ ...base, level: "warn", event: "ai_credits_insufficient", cost: input.cost })
        return { success: false, ledgerEntryIds: [], planDebited: 0, purchasedDebited: 0 }
      }
      if (isUniqueConstraintViolation(error)) {
        const existing = await prisma.aiCreditLedgerEntry.findMany({
          where: { idempotencyKey: { in: [idKeyPlan, idKeyPurchased] } },
        })
        if (existing.length > 0) {
          auditLog({ ...base, level: "warn", event: "duplicate_attempt", idempotencyKey: input.idempotencyKey })
          return {
            success: true,
            ledgerEntryIds: existing.map((e) => e.id),
            planDebited: debitedAmountFrom(existing, "PLAN"),
            purchasedDebited: debitedAmountFrom(existing, "PURCHASED"),
          }
        }
      }
      if (!(error instanceof InsufficientCreditsError)) {
        auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      }
      throw error
    }
  },

  // Credits back whatever a prior debit() actually took, to the same
  // bucket(s) it came from — never assumes the refund is a single PLAN
  // credit. Idempotent via a derived key so a retried refund never double-
  // credits.
  async refund(input: { workspaceId: string; debitLedgerEntryId: string; reason: string; correlationId?: string }) {
    const correlationId = input.correlationId ?? newCorrelationId()
    const base = { correlationId, workspaceId: input.workspaceId, entity: "AiCreditLedgerEntry", op: "refund" }
    const idempotencyKey = `refund:${input.debitLedgerEntryId}`

    try {
      return await withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const already = await tx.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey } })
        if (already) return already

        const original = await tx.aiCreditLedgerEntry.findUnique({ where: { id: input.debitLedgerEntryId } })
        if (!original || original.reason !== "DEBIT") return null

        const refundAmount = -original.amount // original.amount is negative for a DEBIT
        const cas = await tx.aiCreditBalance.updateMany({
          where: { workspaceId: input.workspaceId, bucket: original.bucket },
          data: { balance: { increment: refundAmount }, version: { increment: 1 } },
        })
        if (cas.count === 0) {
          // No balance row exists for this bucket anymore (should not
          // normally happen) — create it so the refund is never silently lost.
          await tx.aiCreditBalance.create({
            data: { workspaceId: input.workspaceId, bucket: original.bucket, balance: refundAmount },
          })
        }
        const updated = await bucketBalance(tx, input.workspaceId, original.bucket)

        const entry = await tx.aiCreditLedgerEntry.create({
          data: {
            workspaceId: input.workspaceId, bucket: original.bucket, reason: "REFUND", amount: refundAmount,
            balanceAfter: updated?.balance ?? refundAmount, idempotencyKey,
            relatedOperation: original.relatedOperation, relatedEntityId: original.relatedEntityId,
            metadata: JSON.stringify({ reason: input.reason, originalLedgerEntryId: original.id }),
          },
        })
        auditLog({ ...base, event: "ai_credits_refunded", entityId: entry.id, amount: refundAmount, reason: input.reason })
        return entry
      }), { context: base })
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return prisma.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey } })
      }
      auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      throw error
    }
  },

  // Idempotent by construction — idempotencyKey is deterministic per
  // (workspace, cycle), so re-running the monthly grant job never double-
  // grants even before the raw partial index (docs/indexes.md) is created.
  async grantCycle(input: { workspaceId: string; amount: number; cycleKey: string; expiresAt: Date }) {
    const correlationId = newCorrelationId()
    const base = { correlationId, workspaceId: input.workspaceId, entity: "AiCreditLedgerEntry", op: "grantCycle" }
    const idempotencyKey = `grant:${input.workspaceId}:${input.cycleKey}`

    try {
      return await withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const already = await tx.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey } })
        if (already) return already

        const upserted = await tx.aiCreditBalance.upsert({
          where: { workspaceId_bucket: { workspaceId: input.workspaceId, bucket: "PLAN" } },
          create: { workspaceId: input.workspaceId, bucket: "PLAN", balance: input.amount, expiresAt: input.expiresAt },
          update: { balance: { increment: input.amount }, expiresAt: input.expiresAt },
        })
        const entry = await tx.aiCreditLedgerEntry.create({
          data: {
            workspaceId: input.workspaceId, bucket: "PLAN", reason: "GRANT_CYCLE", amount: input.amount,
            balanceAfter: upserted.balance, idempotencyKey, cycleKey: input.cycleKey,
          },
        })
        auditLog({ ...base, event: "ai_credits_granted", entityId: entry.id, amount: input.amount, cycleKey: input.cycleKey })
        return entry
      }), { context: base })
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        auditLog({ ...base, level: "warn", event: "duplicate_attempt", cycleKey: input.cycleKey })
        return prisma.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey } })
      }
      auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      throw error
    }
  },

  // PLAN-bucket credits never accumulate — the residual at cycle end is
  // written off, not carried forward. No-op (idempotent) if already expired
  // for this cycle.
  async expirePlanResidual(input: { workspaceId: string; cycleKey: string }) {
    const correlationId = newCorrelationId()
    const base = { correlationId, workspaceId: input.workspaceId, entity: "AiCreditLedgerEntry", op: "expirePlanResidual" }
    const idempotencyKey = `expire:${input.workspaceId}:${input.cycleKey}`

    try {
      return await withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const already = await tx.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey } })
        if (already) return already

        const current = await bucketBalance(tx, input.workspaceId, "PLAN")
        const residual = current?.balance ?? 0
        if (residual <= 0) return null

        await tx.aiCreditBalance.updateMany({
          where: { workspaceId: input.workspaceId, bucket: "PLAN" },
          data: { balance: { decrement: residual }, version: { increment: 1 } },
        })
        const entry = await tx.aiCreditLedgerEntry.create({
          data: {
            workspaceId: input.workspaceId, bucket: "PLAN", reason: "EXPIRE", amount: -residual,
            balanceAfter: 0, idempotencyKey, cycleKey: input.cycleKey,
          },
        })
        auditLog({ ...base, event: "ai_credits_expired", entityId: entry.id, amount: residual, cycleKey: input.cycleKey })
        return entry
      }), { context: base })
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return prisma.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey } })
      }
      auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      throw error
    }
  },

  // PURCHASED bucket — never expires, blocked entirely while the workspace
  // is FROZEN (enforced by the caller, limitService, not here).
  async purchaseCredits(input: { workspaceId: string; amount: number; idempotencyKey: string }) {
    const correlationId = newCorrelationId()
    const base = { correlationId, workspaceId: input.workspaceId, entity: "AiCreditLedgerEntry", op: "purchaseCredits" }

    try {
      return await withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const already = await tx.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
        if (already) return already

        const upserted = await tx.aiCreditBalance.upsert({
          where: { workspaceId_bucket: { workspaceId: input.workspaceId, bucket: "PURCHASED" } },
          create: { workspaceId: input.workspaceId, bucket: "PURCHASED", balance: input.amount },
          update: { balance: { increment: input.amount } },
        })
        const entry = await tx.aiCreditLedgerEntry.create({
          data: {
            workspaceId: input.workspaceId, bucket: "PURCHASED", reason: "PURCHASE", amount: input.amount,
            balanceAfter: upserted.balance, idempotencyKey: input.idempotencyKey,
          },
        })
        auditLog({ ...base, event: "ai_credits_purchased", entityId: entry.id, amount: input.amount })
        return entry
      }), { context: base })
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return prisma.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
      }
      auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      throw error
    }
  },

  // AI Credit Purchase sprint (resumed) — read-only history for the
  // /assinatura/creditos screen. Reuses the append-only ledger directly
  // (the auditable source of truth) rather than a parallel history table.
  listHistory(workspaceId: string, limit = 50) {
    return prisma.aiCreditLedgerEntry.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: "desc" },
      take:    limit,
    })
  },
}
