import { logger } from "@/lib/logger"
import { newCorrelationId } from "@/lib/correlationId"

// CORE-4 (Sprint 0) — the single structured-logging standard for the whole
// backend, superseding three partial patterns that had accumulated
// independently (see CORE_ARCHITECTURE_DECISIONS.md, ADR-012, and the
// Anexo "Revisão de Consistência" in FINANCIAL_ARCHITECTURE_DECISIONS.md,
// §C, for the audit that found them): the Financial module's ad-hoc
// correlationId+event object literals, `src/lib/events.ts`'s typed catalog
// (no correlation id, several dead entries), and free-text `"[billing] ..."`
// logger calls with no structure at all. Every module now calls this one
// function for domain-relevant audit events — never `logger.*` directly for
// an event worth searching for later.
//
// Not for every log line in the app — operational/diagnostic logging
// (a caught non-fatal error, a warning about a slow dependency) stays as a
// plain `logger.*` call. This helper is specifically for events a support
// engineer would grep for by name: something was created, rejected,
// cancelled, retried, or failed in a way that matters to the business.

export type AuditLevel = "info" | "warn" | "error"

export interface AuditLogFields {
  /** Stable, snake_case, past-tense event name — e.g. "payment_created",
   *  "subscription_plan_changed". Never renamed once shipped; it's an
   *  implicit metric name as much as a log field. */
  event: string
  workspaceId?: string
  userId?: string
  /** Domain entity this event is about — e.g. "Payment", "Subscription". */
  entity?: string
  entityId?: string
  /** Propagate an existing correlationId to keep every log line for one
   *  operation grep-able together; omit to mint a new one here. */
  correlationId?: string
  /** Operation duration in milliseconds, when known. */
  duration?: number
  level?: AuditLevel
  /** Attach a caught error — merged in as `err` for pino's error serializer. */
  err?: unknown
  /** Any additional non-sensitive context (amounts already formatted,
   *  reasons, counts). Never pass secrets/tokens/PII — see stripSensitive
   *  below for the automatic safety net, which is a backstop, not a
   *  substitute for not passing sensitive fields in the first place. */
  [key: string]: unknown
}

// Backstop, not a substitute for caller discipline: strips any field whose
// KEY looks like it holds a secret, regardless of what module is calling.
// Doesn't (and can't) know if a value is sensitive by content — callers are
// still responsible for never passing raw tokens/passwords/card numbers.
const SENSITIVE_KEY_PATTERN = /password|secret|token|authorization|jwt|apikey|api_key|creditcard|cvv|refreshtoken/i

function stripSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    clean[key] = value
  }
  return clean
}

export function auditLog(fields: AuditLogFields): void {
  const { level = "info", event, correlationId, ...rest } = fields

  const payload = stripSensitive({
    ...rest,
    event,
    correlationId: correlationId ?? newCorrelationId(),
    timestamp: new Date().toISOString(),
  })
  const message = `[audit] ${event}`

  if (level === "error") logger.error(payload, message)
  else if (level === "warn") logger.warn(payload, message)
  else logger.info(payload, message)
}
