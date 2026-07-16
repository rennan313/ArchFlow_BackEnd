import { Prisma } from "@prisma/client"
import { auditLog } from "@/lib/auditLog"
import { incrementCounter } from "@/lib/metrics"

interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  // RC-3.4/3.5 — merged into every log line this function emits, and into
  // the metric names it increments, so retries/conflicts/exhaustion are
  // attributable to the operation and request that caused them (e.g.
  // { correlationId, op: "registerPayment" }) instead of being anonymous
  // "a transaction somewhere retried" noise.
  context?: Record<string, unknown>
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 50

// MongoDB signals a transaction that lost a write-conflict race with a
// TransientTransactionError error label (WriteConflict being the most
// common underlying cause) — the client is expected to retry these; they
// mean "someone else's transaction touched the same document first," not
// "your request was invalid." See:
// https://www.mongodb.com/docs/manual/core/transactions-in-applications/#retry-transactions
//
// Prisma surfaces this as PrismaClientKnownRequestError with code P2034
// ("Transaction failed due to a write conflict or a deadlock. Please retry
// your transaction"). The message-substring fallback exists because error
// wrapping can vary in edge cases (e.g. a conflict surfacing through
// $runCommandRaw instead of the typed query API) and this function would
// rather retry an ambiguous case than let a real concurrency conflict
// surface as a raw 500 to the user.
export function isTransientTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true
  if (error instanceof Error && /TransientTransactionError|WriteConflict/i.test(error.message)) return true
  return false
}

// Wraps any function that internally runs prisma.$transaction(...) — every
// financial write in this domain (createWithInstallments, registerPayment)
// goes through this rather than calling $transaction directly, so a
// concurrent write conflict on the same document (two payments racing on
// the same installment, e.g.) gets retried with exponential backoff instead
// of bubbling up as an opaque 500. Idempotency (RC-2.1) is what makes this
// safe to retry at all — a retried financial write must be provably
// side-effect-free or side-effect-equivalent, which is exactly what the
// idempotencyKey on Payment guarantees for registerPayment.
export async function withTransactionRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const context = options.context ?? {}

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const isTransient = isTransientTransactionError(error)
      const retryable = isTransient && attempt < maxAttempts
      if (isTransient) {
        incrementCounter("financial.transactionRetry.conflict")
        auditLog({ ...context, level: "warn", event: "transactional_conflict", attempt })
      }
      if (!retryable) {
        if (isTransient) {
          incrementCounter("financial.transactionRetry.exhausted")
          auditLog({ ...context, level: "error", event: "retry_exhausted", err: error, attempt })
        }
        throw error
      }
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs
      incrementCounter("financial.transactionRetry.attempt")
      auditLog({ ...context, level: "warn", event: "retry_executed", attempt, delayMs: Math.round(delay) })
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
