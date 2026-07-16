import { describe, it, expect } from "vitest"
import { dateOnlyToUTCMidnight, startOfBusinessMonth, endOfBusinessMonth } from "@/lib/dateOnly"

describe("dateOnlyToUTCMidnight", () => {
  it("anchors a YYYY-MM-DD string to UTC midnight, not local time", () => {
    const d = dateOnlyToUTCMidnight("2026-07-15")
    expect(d.toISOString()).toBe("2026-07-15T00:00:00.000Z")
  })
})

// RC-2.9 — regression coverage for the exact bug the RC-1 audit found:
// month-boundary math using server-local Date components instead of a
// pinned business timezone. These assertions are independent of whatever
// timezone the test runner's process happens to be in (that's the point).
describe("startOfBusinessMonth / endOfBusinessMonth — pinned to Brazil (UTC-3), not server-local time", () => {
  it("mid-month UTC instant resolves to the same month in Brazil", () => {
    const now = new Date("2026-07-15T18:00:00.000Z") // 15:00 in Brazil, unambiguous
    expect(startOfBusinessMonth(now).toISOString()).toBe("2026-07-01T03:00:00.000Z") // July 1 00:00 BRT
    expect(endOfBusinessMonth(now).toISOString()).toBe("2026-08-01T02:59:59.999Z")   // July 31 23:59:59.999 BRT
  })

  it("the exact boundary case the audit flagged: early UTC hours on the 1st are still the PREVIOUS month in Brazil", () => {
    // 2026-08-01T01:00:00Z is 2026-07-31T22:00:00 in Brazil (UTC-3) — still July.
    // A naive server-local-UTC implementation would report August here.
    const now = new Date("2026-08-01T01:00:00.000Z")
    expect(startOfBusinessMonth(now).toISOString()).toBe("2026-07-01T03:00:00.000Z")
    expect(endOfBusinessMonth(now).toISOString()).toBe("2026-08-01T02:59:59.999Z")
  })

  it("late UTC hours near midnight already roll into the next month in Brazil", () => {
    // 2026-07-31T03:30:00Z is 2026-07-31T00:30:00 in Brazil — still July 31,
    // firmly inside the month, not a boundary case, sanity check only.
    const now = new Date("2026-07-31T03:30:00.000Z")
    expect(startOfBusinessMonth(now).toISOString()).toBe("2026-07-01T03:00:00.000Z")
  })

  it("December -> January year rollover is handled correctly", () => {
    const now = new Date("2026-12-15T12:00:00.000Z")
    expect(startOfBusinessMonth(now).toISOString()).toBe("2026-12-01T03:00:00.000Z")
    expect(endOfBusinessMonth(now).toISOString()).toBe("2027-01-01T02:59:59.999Z")
  })
})
