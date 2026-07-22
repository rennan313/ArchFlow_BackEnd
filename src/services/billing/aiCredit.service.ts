import { aiCreditRepository } from "@/repositories/aiCredit.repository"

// Entitlements Sprint (2026-07) — flat cost per AI operation type (blueprint
// DP3), deliberately NOT token-based. tokensUsed is already returned by
// generation.service.ts/premium-narrative-generation.service.ts but is a
// cost-accounting detail for Anthropic billing, not what we charge the
// workspace — a flat, predictable cost per operation is what the pricing
// page can actually promise ("20 créditos IA/ciclo").
export type AiOperation = "proposta_completa" | "documento" | "narrativa" | "revisao"

const OPERATION_COST: Record<AiOperation, number> = {
  proposta_completa: 5,
  documento: 3,
  narrativa: 2,
  revisao: 1,
}

export interface DebitInput {
  workspaceId: string
  operation: AiOperation
  idempotencyKey: string // caller-generated, e.g. `ai-debit:${proposalId}:${attempt}`
  relatedEntityId?: string
}

export interface DebitResult {
  allowed: boolean
  reason?: string
  ledgerEntryIds: string[]
}

// Monthly grant is idempotent by cycleKey (aiCreditRepository.grantCycle) —
// safe to call from a cron that might fire twice for the same period.
function cycleKeyFor(subscriptionId: string, periodStart: Date): string {
  return `sub_${subscriptionId}:${periodStart.toISOString()}`
}

export const aiCreditService = {
  getCostForOperation(operation: AiOperation): number {
    return OPERATION_COST[operation]
  },

  async getBalance(workspaceId: string): Promise<{ plan: number; purchased: number; total: number }> {
    const { plan, purchased } = await aiCreditRepository.getBalances(workspaceId)
    return { plan, purchased, total: plan + purchased }
  },

  // Debits plan-bucket first, then purchased for the remainder — atomic,
  // idempotent (a retried AI call with the same idempotencyKey never
  // double-charges). Returns {allowed:false} rather than throwing when
  // credits are insufficient — same "structured result, not exception"
  // convention as limitService's LimitCheckResult; the caller (an AI route)
  // decides whether that becomes a 403.
  async debit(input: DebitInput): Promise<DebitResult> {
    const cost = OPERATION_COST[input.operation]
    const outcome = await aiCreditRepository.debit({
      workspaceId: input.workspaceId,
      cost,
      idempotencyKey: input.idempotencyKey,
      relatedOperation: `ai.${input.operation}`,
      relatedEntityId: input.relatedEntityId,
    })
    if (!outcome.success) {
      return { allowed: false, reason: `AI credits exhausted (need ${cost}). Buy more credits or upgrade your plan.`, ledgerEntryIds: [] }
    }
    return { allowed: true, ledgerEntryIds: outcome.ledgerEntryIds }
  },

  // Called by an AI route when the generation itself fails AFTER the debit
  // already succeeded — restores the credits atomically. One refund call per
  // ledger entry id returned by debit() (usually one, occasionally two if
  // the debit spanned both buckets).
  async refund(workspaceId: string, ledgerEntryIds: string[], reason: string): Promise<void> {
    for (const id of ledgerEntryIds) {
      await aiCreditRepository.refund({ workspaceId, debitLedgerEntryId: id, reason })
    }
  },

  // Idempotent — safe to run twice for the same (subscription, period).
  // Grants `amount` to the PLAN bucket, expiring at the end of that period
  // (PLAN credits never accumulate — see expireCycleResidual below, called
  // separately at the OLD period's end, before this grants the new period).
  async grantCycle(input: { workspaceId: string; subscriptionId: string; amount: number; periodStart: Date; periodEnd: Date }) {
    return aiCreditRepository.grantCycle({
      workspaceId: input.workspaceId,
      amount: input.amount,
      cycleKey: cycleKeyFor(input.subscriptionId, input.periodStart),
      expiresAt: input.periodEnd,
    })
  },

  // Writes off whatever is left in the PLAN bucket at the end of a cycle —
  // must be called before grantCycle() for the next period, never after
  // (grantCycle increments the same bucket; calling expire after would wipe
  // out the new grant too).
  async expireCycleResidual(input: { workspaceId: string; subscriptionId: string; periodStart: Date }) {
    return aiCreditRepository.expirePlanResidual({
      workspaceId: input.workspaceId,
      cycleKey: cycleKeyFor(input.subscriptionId, input.periodStart),
    })
  },

  // PURCHASED bucket — never expires. Caller (route/service) is responsible
  // for blocking this entirely while the workspace is FROZEN (blueprint:
  // "não vender para conta congelada") — not this service's concern, since
  // it has no opinion on subscription status.
  async purchaseCredits(workspaceId: string, amount: number, idempotencyKey: string) {
    return aiCreditRepository.purchaseCredits({ workspaceId, amount, idempotencyKey })
  },
}
