// RC-3.5 — lightweight in-process metrics for the financial engine. This is
// deliberately NOT wired to Prometheus/OpenTelemetry/any external sink this
// sprint — it's the collection seam so that integration later is a matter
// of swapping getMetricsSnapshot()'s consumer, not re-instrumenting every
// call site. See docs/financial-architecture.md ("RC-3.5 — Observabilidade")
// for the planned OTel migration: each `timed()`/`incrementCounter()` call
// below maps directly to an OTel Histogram/Counter recording.
//
// In-memory, per-process, reset on restart — acceptable for the current
// single-instance deployment. Would need a shared backend (OTel collector,
// StatsD, etc.) the moment this runs on more than one instance.

interface DurationSample {
  count: number
  totalMs: number
  maxMs: number
}

const durations = new Map<string, DurationSample>()
const counters = new Map<string, number>()

export function recordDuration(metric: string, ms: number): void {
  const sample = durations.get(metric) ?? { count: 0, totalMs: 0, maxMs: 0 }
  sample.count += 1
  sample.totalMs += ms
  sample.maxMs = Math.max(sample.maxMs, ms)
  durations.set(metric, sample)
}

export function incrementCounter(metric: string, by = 1): void {
  counters.set(metric, (counters.get(metric) ?? 0) + by)
}

export async function timed<T>(metric: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    recordDuration(metric, performance.now() - start)
  }
}

export function getMetricsSnapshot() {
  return {
    durations: Object.fromEntries(
      [...durations].map(([key, s]) => [key, { count: s.count, avgMs: Math.round((s.totalMs / s.count) * 100) / 100, maxMs: Math.round(s.maxMs * 100) / 100 }]),
    ),
    counters: Object.fromEntries(counters),
  }
}

// Test/script-only reset — production code never calls this (metrics persist
// for the life of the process).
export function resetMetrics(): void {
  durations.clear()
  counters.clear()
}
