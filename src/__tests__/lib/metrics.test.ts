import { describe, it, expect, beforeEach } from "vitest"
import { recordDuration, incrementCounter, timed, getMetricsSnapshot, resetMetrics } from "@/lib/metrics"

describe("metrics.ts — in-process financial-engine metrics (RC-3.5)", () => {
  beforeEach(() => resetMetrics())

  it("recordDuration accumulates count, average, and max per metric name", () => {
    recordDuration("financial.registerPayment", 10)
    recordDuration("financial.registerPayment", 20)
    recordDuration("financial.registerPayment", 30)

    const snapshot = getMetricsSnapshot()
    expect(snapshot.durations["financial.registerPayment"]).toEqual({ count: 3, avgMs: 20, maxMs: 30 })
  })

  it("keeps separate metrics isolated by name", () => {
    recordDuration("a", 5)
    recordDuration("b", 100)

    const snapshot = getMetricsSnapshot()
    expect(snapshot.durations.a.maxMs).toBe(5)
    expect(snapshot.durations.b.maxMs).toBe(100)
  })

  it("incrementCounter defaults to +1 and accumulates across calls", () => {
    incrementCounter("financial.transactionRetry.attempt")
    incrementCounter("financial.transactionRetry.attempt")
    incrementCounter("financial.transactionRetry.attempt", 3)

    expect(getMetricsSnapshot().counters["financial.transactionRetry.attempt"]).toBe(5)
  })

  it("timed() records the wrapped function's duration and returns its result unchanged", async () => {
    const result = await timed("financial.dashboard.getWidgets", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { widgets: 42 }
    })

    expect(result).toEqual({ widgets: 42 })
    expect(getMetricsSnapshot().durations["financial.dashboard.getWidgets"].count).toBe(1)
  })

  it("timed() still records a duration sample when the wrapped function throws", async () => {
    await expect(timed("financial.failingOp", async () => { throw new Error("boom") })).rejects.toThrow("boom")
    expect(getMetricsSnapshot().durations["financial.failingOp"].count).toBe(1)
  })

  it("resetMetrics clears both durations and counters", () => {
    recordDuration("x", 1)
    incrementCounter("y")
    resetMetrics()

    const snapshot = getMetricsSnapshot()
    expect(snapshot.durations).toEqual({})
    expect(snapshot.counters).toEqual({})
  })
})
