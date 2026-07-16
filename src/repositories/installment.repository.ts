import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { add, subtract, type Cents } from "@/lib/money"
import { auditLog } from "@/lib/auditLog"
import { newCorrelationId } from "@/lib/correlationId"
import { timed, incrementCounter } from "@/lib/metrics"
import type { InstallmentQueryInput } from "@/validations/installment"

const DOCUMENT_SUMMARY = {
  select: {
    id: true, direction: true, description: true,
    project:    { select: { id: true, name: true } },
    client:     { select: { id: true, name: true } },
    supplier:   { select: { id: true, name: true } },
    category:   { select: { id: true, name: true } },
    costCenter: { select: { id: true, name: true } },
  },
} as const

const INSTALLMENT_INCLUDE = {
  payments:          { orderBy: { createdAt: "desc" as const } },
  financialDocument: DOCUMENT_SUMMARY,
} as const

interface RegisterPaymentInput {
  workspaceId: string
  bankAccountId: string
  amountCents: Cents
  paidAt: Date
  method: "PIX" | "BOLETO" | "TRANSFER" | "CASH" | "CARD"
  createdByUserId: string
  // RC-2.1 — required on every payment write; the @unique index on
  // Payment.idempotencyKey is what actually enforces "never twice", not
  // this pre-check (see registerPayment's comment for why both exist).
  idempotencyKey: string
  // RC-3.4 — optional; generated if omitted. Lets a caller that already has
  // a request-scoped id (e.g. a future HTTP request-id) propagate it so
  // logs correlate end-to-end instead of getting a fresh one per layer.
  correlationId?: string
}

// Prisma's error code for a unique-constraint violation — used here to
// detect "someone else's concurrent request already used this
// idempotencyKey" without a separate lookup-then-branch race window.
function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export const installmentRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.installment.findFirst({ where: { id, workspaceId }, include: INSTALLMENT_INCLUDE })
  },

  findManyByDocument(financialDocumentId: string) {
    return prisma.installment.findMany({
      where: { financialDocumentId },
      orderBy: { number: "asc" },
      include: { payments: { orderBy: { createdAt: "desc" } } },
    })
  },

  async findMany(workspaceId: string, query: InstallmentQueryInput) {
    const { page, limit, direction, projectId, clientId, supplierId, categoryId, costCenterId, status, overdue, dueDateFrom, dueDateTo, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.InstallmentWhereInput = {
      workspaceId,
      ...(status && { status }),
      ...(overdue && { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: new Date() } }),
      ...((dueDateFrom || dueDateTo) && {
        dueDate: { ...(dueDateFrom && { gte: dueDateFrom }), ...(dueDateTo && { lte: dueDateTo }) },
      }),
      financialDocument: {
        isCancelled: false,
        ...(direction    && { direction }),
        ...(projectId    && { projectId }),
        ...(clientId     && { clientId }),
        ...(supplierId   && { supplierId }),
        ...(categoryId   && { categoryId }),
        ...(costCenterId && { costCenterId }),
      },
    }

    const [data, total] = await Promise.all([
      prisma.installment.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder }, include: INSTALLMENT_INCLUDE }),
      prisma.installment.count({ where }),
    ])
    return { data, total }
  },

  findPaymentByIdempotencyKey(idempotencyKey: string) {
    return prisma.payment.findUnique({ where: { idempotencyKey } })
  },

  // The only write path for Payment. Idempotency (RC-2.1) is layered:
  // 1. A fast-path pre-check (in installment.service.ts, before this is
  //    even called) returns early on an obvious replay without touching
  //    the transaction at all.
  // 2. THE SAME CHECK IS REPEATED FIRST, INSIDE the transaction, on every
  //    attempt — including retries. This is not redundant: real concurrency
  //    testing against MongoDB (not mocks) caught the bug this closes —
  //    two concurrent calls with the same key, where attempt 1 commits its
  //    payment, and attempt 2's transaction loses the write-conflict on the
  //    shared Installment document and gets retried by withTransactionRetry.
  //    On that RETRY, attempt 2 would re-read the installment with a now
  //    *smaller* remaining balance (attempt 1's payment already landed) and
  //    incorrectly throw PAYMENT_EXCEEDS_REMAINING instead of recognizing
  //    "this is the same payment my concurrent twin already completed."
  //    Checking-for-an-existing-payment-by-key must happen at the START of
  //    every attempt, not just once before the transaction begins.
  // 3. The @unique index on idempotencyKey remains the final safety net —
  //    if two attempts both pass step 2's check in the same instant (true
  //    TOCTOU), only one create() can win; the other's P2002 is caught
  //    below and resolved by fetching the winner's payment.
  //
  // RC-3.1 — cancellation guard. Before this fix, cancelIfNoPayments()
  // (financialDocument.repository.ts) and this function touched disjoint
  // collections (FinancialDocument vs Installment/Payment), so a concurrent
  // cancel could commit in the gap between this function's balance check and
  // its payment.create(), producing a cancelled document with a live payment
  // against it. The fix: this transaction now also performs a conditional
  // write against the PARENT FinancialDocument (`isCancelled: false` in the
  // where-clause, bumping `version`) before creating the payment. That's a
  // real write to the same document cancelIfNoPayments writes to, which
  // gives MongoDB's own snapshot-isolation write-conflict detection
  // something genuine to serialize on — no bespoke lock table needed, and
  // a losing side is retried by withTransactionRetry exactly like any other
  // transient conflict. On retry it re-reads fresh state and reaches the
  // correct outcome deterministically (see cancelIfNoPayments's comment for
  // the mirror side of this). Considered alternatives: a distributed lock
  // collection (strictly more moving parts for the same guarantee Mongo's
  // transaction engine already gives for free once both writers touch the
  // same document); merging FinancialDocument+Installment+Payment into one
  // aggregate document (would fix this for free but is a large schema
  // rewrite, ruled out of scope for a hardening sprint with a "no big
  // refactors" mandate — see RC-3.9 for the eventual case for it).
  //
  // Runs inside a single $transaction (via withTransactionRetry, so a
  // losing write-conflict on the shared Installment document under real
  // concurrency gets retried with backoff instead of surfacing as a raw
  // 500) so "create the payment" and "recompute the installment's status"
  // can never diverge — Mongo has no trigger/constraint that would keep
  // them in sync otherwise. Throwing inside the callback rolls back the
  // whole transaction, so an over-payment never leaves a partial write
  // behind.
  async registerPayment(installmentId: string, input: RegisterPaymentInput) {
    const correlationId = input.correlationId ?? newCorrelationId()
    const base = { correlationId, workspaceId: input.workspaceId, userId: input.createdByUserId, entity: "Payment", op: "registerPayment", installmentId }

    try {
      return await timed("financial.registerPayment", () => withTransactionRetry(() => prisma.$transaction(async (tx) => {
        const alreadyProcessed = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
        if (alreadyProcessed) return alreadyProcessed

        const installment = await tx.installment.findFirst({
          where: { id: installmentId, workspaceId: input.workspaceId },
          include: { payments: true, financialDocument: { select: { direction: true, projectId: true } } },
        })
        if (!installment) throw new AppError(ErrorCode.INSTALLMENT_NOT_FOUND)

        // RC-3.1 guard-write — see function-level comment above.
        const guard = await tx.financialDocument.updateMany({
          where: { id: installment.financialDocumentId, workspaceId: input.workspaceId, isCancelled: false },
          data: { version: { increment: 1 } },
        })
        if (guard.count === 0) {
          incrementCounter("financial.registerPayment.blockedByCancel")
          auditLog({ ...base, level: "warn", event: "payment_rejected", entityId: installment.financialDocumentId, reason: "FINANCIAL_DOCUMENT_CANCELLED" })
          throw new AppError(ErrorCode.FINANCIAL_DOCUMENT_CANCELLED)
        }

        const paidSoFar      = add(...installment.payments.map((p) => p.amountCents))
        const remainingCents = subtract(installment.amountCents, paidSoFar)
        if (remainingCents <= 0n) {
          auditLog({ ...base, level: "warn", event: "payment_rejected", reason: "INSTALLMENT_ALREADY_PAID" })
          throw new AppError(ErrorCode.INSTALLMENT_ALREADY_PAID)
        }
        if (input.amountCents > remainingCents) {
          auditLog({ ...base, level: "warn", event: "payment_rejected", reason: "PAYMENT_EXCEEDS_REMAINING" })
          throw new AppError(ErrorCode.PAYMENT_EXCEEDS_REMAINING)
        }

        const payment = await tx.payment.create({
          data: {
            workspaceId:     input.workspaceId,
            installmentId,
            bankAccountId:   input.bankAccountId,
            amountCents:     input.amountCents,
            paidAt:          input.paidAt,
            method:          input.method,
            createdByUserId: input.createdByUserId,
            idempotencyKey:  input.idempotencyKey,
            direction:       installment.financialDocument.direction,
            projectId:       installment.financialDocument.projectId,
          },
        })

        const newStatus = add(paidSoFar, input.amountCents) >= installment.amountCents ? "PAID" : "PARTIAL"
        await tx.installment.update({ where: { id: installmentId }, data: { status: newStatus } })

        return payment
      }), { context: base }))
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.findPaymentByIdempotencyKey(input.idempotencyKey)
        if (existing) {
          incrementCounter("financial.registerPayment.duplicateAttempt")
          auditLog({ ...base, level: "warn", event: "duplicate_attempt", entityId: existing.id, idempotencyKey: input.idempotencyKey })
          return existing
        }
      }
      if (!(error instanceof AppError)) {
        auditLog({ ...base, level: "error", event: "unexpected_error", err: error })
      }
      throw error
    }
  },
}
