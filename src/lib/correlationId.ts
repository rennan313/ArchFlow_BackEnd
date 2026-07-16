import { randomUUID } from "node:crypto"

// RC-3.4 — originated as a per-operation id threaded through every log line
// emitted while handling one financial write (service → repository →
// transactionRetry), so a support engineer grepping logs for one failed
// payment sees every related line, including retries.
//
// CORE-4 (Sprint 0) — promoted from a Financial-only convention to the
// correlation-id primitive behind `@/lib/auditLog`, the single logging
// standard for the whole app (see CORE_ARCHITECTURE_DECISIONS.md, ADR-012).
// Still deliberately explicit-per-call rather than a global request-scoped
// AsyncLocalStorage context — callers generate or receive one explicitly and
// pass it down (or let `auditLog` generate one if omitted), which covers
// every audit-log call site without adding app-wide request middleware.
export function newCorrelationId(): string {
  return randomUUID()
}
