export async function register() {
  // Validate all required env vars at startup — fail fast before the first
  // request instead of throwing mid-request on the first API call.
  const { env } = await import("./src/lib/env")

  // Sentry is entirely optional — inert unless SENTRY_DSN is set, matching
  // the graceful-degradation pattern already used for SMTP. No DSN
  // configured means zero runtime cost.
  if (!env.sentryDsn) return

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs")
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.isDev ? "development" : "production",
      release: env.sentryRelease,
      tracesSampleRate: 0,
    })
  }
}
