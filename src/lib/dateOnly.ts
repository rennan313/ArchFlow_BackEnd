// RC-2.9 — Date-Only vs DateTime, formalized as two distinct concepts. The
// original RC-1 timezone bug (dates displaying one day off) happened
// because this distinction was implicit and handled ad-hoc per call site.
//
// 1. DATE-ONLY fields — Installment.dueDate, FinancialDocument.competencyDate,
//    Payment.paidAt. These represent a calendar day a human picked via
//    <input type="date">, with no meaningful time-of-day. They are stored
//    as UTC midnight and MUST always be read/compared/displayed in UTC —
//    never the server's or the viewer's local timezone — so the calendar
//    day that comes back out is exactly the one that went in, everywhere.
//    (The frontend counterpart of this rule is formatDateOnly() in
//    ArchFlow/src/lib/format.ts — same principle, same reasoning.)
//
// 2. BUSINESS DATETIME — "what month is it right now for a Brazilian
//    office" (dashboard month-boundary aggregation). This needs the actual
//    current wall-clock time in Brazil, which silently depends on the
//    server process's own timezone unless explicitly pinned — the RC-1
//    audit caught financialDashboard.service.ts doing exactly that with
//    `new Date(d.getFullYear(), d.getMonth(), 1)` (server-local components).
//
// BUSINESS_UTC_OFFSET_HOURS is a fixed constant, not a real IANA timezone
// lookup, because Brazil has used a single fixed UTC-3 offset nationwide
// with no DST since 2019 — this is genuinely correct today, not just a
// convenient shortcut. If Brazil ever reinstates DST, or Vincel Studio expands
// outside Brazil, this must move to a real timezone library (date-fns-tz /
// luxon) — intentionally not added now: no other part of this codebase
// needs one, and pulling in a dependency for a single fixed-offset
// constant would be scope creep for a critical-fixes-only sprint.

const BUSINESS_UTC_OFFSET_HOURS = -3
const HOUR_MS = 60 * 60 * 1000

/** A calendar date (YYYY-MM-DD, from an <input type="date">) as its canonical UTC-midnight instant. */
export function dateOnlyToUTCMidnight(isoDateString: string): Date {
  return new Date(`${isoDateString}T00:00:00.000Z`)
}

/** Options for formatting a Date-Only field for display — always pin timeZone to UTC. */
export const DATE_ONLY_FORMAT_TZ: Pick<Intl.DateTimeFormatOptions, "timeZone"> = { timeZone: "UTC" }

function toBusinessLocalFrame(date: Date): Date {
  return new Date(date.getTime() + BUSINESS_UTC_OFFSET_HOURS * HOUR_MS)
}

function fromBusinessLocalFrame(localFrameInstant: number): Date {
  return new Date(localFrameInstant - BUSINESS_UTC_OFFSET_HOURS * HOUR_MS)
}

/** Start of the current month in business-local (Brazil) time, as the equivalent UTC instant. */
export function startOfBusinessMonth(date: Date): Date {
  const local = toBusinessLocalFrame(date)
  const startOfMonthLocalFrame = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 0, 0, 0, 0)
  return fromBusinessLocalFrame(startOfMonthLocalFrame)
}

/** End of the current month (23:59:59.999) in business-local (Brazil) time, as the equivalent UTC instant. */
export function endOfBusinessMonth(date: Date): Date {
  const local = toBusinessLocalFrame(date)
  const endOfMonthLocalFrame = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  return fromBusinessLocalFrame(endOfMonthLocalFrame)
}
