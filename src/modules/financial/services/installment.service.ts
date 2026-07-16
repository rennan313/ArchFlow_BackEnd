import { installmentRepository } from "@/repositories/installment.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { reaisToCents, formatCentsBRL } from "@/lib/money"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import type { InstallmentQueryInput } from "@/validations/installment"
import type { RegisterPaymentInput } from "@/validations/payment"

export const installmentService = {
  async list(workspaceId: string, query: InstallmentQueryInput) {
    const { data, total } = await installmentRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const installment = await installmentRepository.findById(id, workspaceId)
    if (!installment) throw new AppError(ErrorCode.INSTALLMENT_NOT_FOUND)
    return installment
  },

  // Allows partial, total, or multiple payments against the same
  // installment — installmentRepository.registerPayment enforces the
  // remaining-balance invariant atomically. Payment rows are append-only:
  // there is no update/delete route for them anywhere in this module.
  //
  // RC-2.1 fast path: if this exact idempotencyKey already produced a
  // payment (retry, double-click that raced past the frontend's disabled
  // state, a second tab, a resumed request after refresh — see
  // FinancialDocumentDetailClient.tsx's localStorage-persisted key), return
  // it directly without re-running the balance-check transaction. This is
  // a performance/clarity shortcut only — the actual duplicate-prevention
  // guarantee comes from the @unique index, enforced unconditionally inside
  // installmentRepository.registerPayment even if this pre-check is somehow
  // bypassed or races against a concurrent identical request.
  async registerPayment(installmentId: string, workspaceId: string, userId: string, input: RegisterPaymentInput) {
    const correlationId = newCorrelationId()

    const existing = await installmentRepository.findPaymentByIdempotencyKey(input.idempotencyKey)
    if (existing) {
      // Defense in depth: a workspace-crossing idempotencyKey reuse (only
      // plausible if a client replays or guesses another tenant's key —
      // astronomically unlikely for a random UUID, but cross-tenant
      // isolation is never "trust the input") must not leak that payment.
      if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.INSTALLMENT_NOT_FOUND)
      auditLog({ correlationId, workspaceId, userId, entity: "Payment", entityId: existing.id, event: "duplicate_attempt", installmentId, idempotencyKey: input.idempotencyKey })
      return existing
    }

    await assertWorkspaceReferences(workspaceId, { bankAccountId: input.bankAccountId })

    const payment = await installmentRepository.registerPayment(installmentId, {
      workspaceId,
      bankAccountId:   input.bankAccountId,
      amountCents:     reaisToCents(input.amount),
      paidAt:          input.paidAt,
      method:          input.method,
      createdByUserId: userId,
      idempotencyKey:  input.idempotencyKey,
      correlationId,
    })

    auditLog({ correlationId, workspaceId, userId, entity: "Payment", entityId: payment.id, event: "payment_created", installmentId, amount: formatCentsBRL(payment.amountCents), method: payment.method })
    return payment
  },
}
