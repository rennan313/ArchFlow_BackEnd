// Worklog Sprint V2, MEL-01 — shared timezone resolution + calendar-bucketing
// helpers. Replaces the UTC-fixed dayKey()/weekKey() that used to live inline
// in worklogSummary.service.ts. TimeEntry timestamps are always stored/
// computed in UTC (unchanged, ADR-021) — this only decides which calendar
// day/week a given instant belongs to for display and aggregation.

/** Cache — Intl.supportedValuesOf("timeZone") allocates a ~418-entry array;
 *  called on every validated write (validations/workspace.ts) and every
 *  worklog-summary/time-entries request that carries a client tz fallback,
 *  worth not rebuilding per call. */
let _validZones: Set<string> | null = null
function validZones(): Set<string> {
  if (!_validZones) _validZones = new Set(Intl.supportedValuesOf("timeZone"))
  return _validZones
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  return typeof tz === "string" && tz.length > 0 && validZones().has(tz)
}

/**
 * Resolves the timezone to bucket/display TimeEntry instants under.
 * Precedence (Sprint V2 decision): Workspace.timezone always wins once an
 * OWNER/ADMIN has set one; a client-supplied fallback (the requester's
 * browser-resolved zone, sent as `?tz=`) is used only while the workspace has
 * none configured; "UTC" is the last-resort default so bucketing is always
 * deterministic even for a first request with neither.
 */
export function resolveTimezone(workspaceTimezone: string | null | undefined, clientTimezone?: string | null): string {
  if (isValidTimeZone(workspaceTimezone)) return workspaceTimezone
  if (isValidTimeZone(clientTimezone)) return clientTimezone
  return "UTC"
}

/** The (year, month, day) a given instant falls on in `timeZone` — the
 *  building block for both dayKeyInTZ and weekKeyInTZ below. Uses Intl
 *  rather than manual offset math so DST transitions in `timeZone` are
 *  handled correctly without a date library. */
function civilDateInTZ(d: Date, timeZone: string): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d)
  const y   = Number(parts.find((p) => p.type === "year")!.value)
  const m   = Number(parts.find((p) => p.type === "month")!.value)
  const day = Number(parts.find((p) => p.type === "day")!.value)
  return { y, m, day }
}

/** "YYYY-MM-DD" of the calendar day `d` falls on in `timeZone`. */
export function dayKeyInTZ(d: Date, timeZone: string): string {
  const { y, m, day } = civilDateInTZ(d, timeZone)
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** "YYYY-MM-DD" of the Monday starting the ISO week `d` falls in, in
 *  `timeZone`. The intermediate Date is built with Date.UTC() purely as a
 *  calendar calculator on the (y, m, day) triple already resolved in
 *  `timeZone` above — it is never treated as a real instant again, so this
 *  stays correct across DST regardless of what UTC offset `timeZone` has. */
export function weekKeyInTZ(d: Date, timeZone: string): string {
  const { y, m, day } = civilDateInTZ(d, timeZone)
  const calendar = new Date(Date.UTC(y, m - 1, day))
  const weekday  = calendar.getUTCDay()
  const diff     = (weekday === 0 ? -6 : 1) - weekday
  calendar.setUTCDate(calendar.getUTCDate() + diff)
  return calendar.toISOString().slice(0, 10)
}
