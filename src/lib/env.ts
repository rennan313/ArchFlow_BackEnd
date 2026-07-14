const isProd = process.env.NODE_ENV === "production"
// `next build` always runs with NODE_ENV=production — including local/CI
// builds that never touch real production secrets. NEXT_PHASE distinguishes
// "compiling the app" from "actually serving it", so strict vars are only
// enforced at real runtime start (mirrors instrumentation.ts's existing
// fail-fast-at-boot convention), not during `next build` itself.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"
const enforceStrict = isProd && !isBuildPhase

function required(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`[env] Missing required environment variable: ${name}`)
  return val
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

/**
 * Required in production — throws at boot if missing. In development, falls
 * back to `devDefault` so local dev keeps working without every var set. Use
 * this instead of a bare fallback for anything whose value legitimately
 * differs between environments — a silent localhost/default surviving into
 * production turns a boot-time config error into a confusing runtime failure
 * (CORS rejecting the real frontend, emails linking to localhost, etc).
 */
function requiredInProd(name: string, devDefault: string): string {
  const val = process.env[name]
  if (val) return val
  if (!enforceStrict) return devDefault
  throw new Error(`[env] Missing required environment variable in production: ${name}`)
}

/**
 * Same as requiredInProd, but with no dev default at all — for vars that are
 * legitimately optional in dev (e.g. Upstash Redis, which the rate limiter
 * only needs to run distributed; a single dev instance falls back to
 * in-memory on its own). Still fails the boot in production if missing.
 */
function requiredInProdOptional(name: string): string | undefined {
  const val = process.env[name]
  if (val) return val
  if (!enforceStrict) return undefined
  throw new Error(`[env] Missing required environment variable in production: ${name}`)
}

export const env = {
  // ── Database ───────────────────────────────────────────────────────────────
  databaseUrl:               required("DATABASE_URL"),

  // ── JWT ────────────────────────────────────────────────────────────────────
  jwtSecret:                 required("JWT_SECRET"),
  jwtRefreshSecret:          required("JWT_REFRESH_SECRET"),
  jwtExpiresIn:              optional("JWT_EXPIRES_IN",              "15m"),
  jwtRefreshExpiresIn:       optional("JWT_REFRESH_EXPIRES_IN",      "30d"),

  // ── Auth ───────────────────────────────────────────────────────────────────
  resetPasswordExpiresMin:   Number(optional("RESET_PASSWORD_EXPIRES_IN_MINUTES", "30")),
  emailVerificationExpiresMin: Number(optional("EMAIL_VERIFICATION_EXPIRES_IN_MINUTES", "1440")),
  googleClientId:            optional("GOOGLE_CLIENT_ID", ""),
  googleAuthEnabled:         !!process.env.GOOGLE_CLIENT_ID,

  // ── Supabase ───────────────────────────────────────────────────────────────
  // Note: SUPABASE_JWT_SECRET is no longer required. Token validation uses
  // supabase.auth.getUser() (Supabase's recommended approach for modern projects).
  supabaseUrl:               required("SUPABASE_URL"),
  supabaseServiceRoleKey:    required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseStorageBucket:     optional("SUPABASE_STORAGE_BUCKET",     "proposal-media"),

  // ── AI ─────────────────────────────────────────────────────────────────────
  anthropicApiKey:           required("ANTHROPIC_API_KEY"),

  // ── SMTP (optional — validated lazily in mailer.ts when email is sent) ────
  // Absence only disables password-reset emails; it never blocks startup.
  // In production, set all four vars to enable email delivery.
  smtpHost:     optional("SMTP_HOST",   ""),
  smtpPort:     Number(optional("SMTP_PORT",   "587")),
  smtpSecure:   optional("SMTP_SECURE", "false") === "true",
  smtpUser:     optional("SMTP_USER",   ""),
  smtpPass:     optional("SMTP_PASS",   ""),
  smtpFrom:     optional("SMTP_FROM",   "ArchFlow <noreply@archflowstudio.com>"),
  emailEnabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  // Internal inbox that receives "schedule a demo" lead notifications from the
  // public pricing page. Falls back to SMTP_FROM so nothing breaks if unset.
  salesEmail:   optional("SALES_EMAIL", optional("SMTP_FROM", "ArchFlow <noreply@archflowstudio.com>")),

  // ── URLs ───────────────────────────────────────────────────────────────────
  frontendUrl:               requiredInProd("FRONTEND_URL",         "http://localhost:3001"),
  // Extra browser origins allowed by CORS besides FRONTEND_URL (comma-
  // separated) — used during the domain migration so old + new + www all
  // work. Consumed by src/middleware.ts (which reads process.env directly).
  allowedOrigins:            optional("ALLOWED_ORIGINS",            ""),
  appUrl:                    requiredInProd("NEXT_PUBLIC_APP_URL",  "http://localhost:3000"),

  // ── Mercado Pago (billing gateway — Sprint 09 / Phase 2) ─────────────────────
  // Optional at boot on purpose: the app must start and serve read/trial flows
  // even before billing is configured. The billing module degrades gracefully
  // (checkout/webhook routes 503 if the token is absent), mirroring how SMTP
  // absence only disables emails. Never required-in-prod so a missing token is
  // a feature-disabled state, not a crash.
  mpAccessToken:   optional("MERCADO_PAGO_ACCESS_TOKEN",  ""),
  mpPublicKey:     optional("MERCADO_PAGO_PUBLIC_KEY",    ""),
  mpWebhookSecret: optional("MERCADO_PAGO_WEBHOOK_SECRET", ""),
  mpEnvironment:   optional("MERCADO_PAGO_ENVIRONMENT",   "sandbox"),
  billingEnabled:  !!process.env.MERCADO_PAGO_ACCESS_TOKEN,

  // ── Rate limiting (Upstash Redis — required in production; a single dev
  // instance falls back to in-memory on its own, see middlewares/rateLimiter.ts) ──
  upstashRedisUrl:           requiredInProdOptional("UPSTASH_REDIS_REST_URL"),
  upstashRedisToken:         requiredInProdOptional("UPSTASH_REDIS_REST_TOKEN"),

  // ── Observability (optional — inert with no DSN) ───────────────────────────
  sentryDsn:                 process.env.SENTRY_DSN,
  sentryRelease:             process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.SENTRY_RELEASE,

  // ── Runtime ────────────────────────────────────────────────────────────────
  nodeEnv:                   optional("NODE_ENV",                   "development"),
  isDev:                     !isProd,
} as const
