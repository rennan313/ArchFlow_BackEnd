function required(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`[env] Missing required environment variable: ${name}`)
  return val
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

export const env = {
  // ── Database ───────────────────────────────────────────────────────────────
  databaseUrl:               required("DATABASE_URL"),

  // ── JWT ────────────────────────────────────────────────────────────────────
  jwtSecret:                 required("JWT_SECRET"),
  jwtRefreshSecret:          required("JWT_REFRESH_SECRET"),
  // NOTE: "7d" matches the typical NextAuth session lifetime to prevent
  // silent 401s. Reduce to "15m" after Supabase migration and proper
  // token refresh is implemented.
  jwtExpiresIn:              optional("JWT_EXPIRES_IN",              "7d"),
  jwtRefreshExpiresIn:       optional("JWT_REFRESH_EXPIRES_IN",      "30d"),

  // ── Auth ───────────────────────────────────────────────────────────────────
  resetPasswordExpiresMin:   Number(optional("RESET_PASSWORD_EXPIRES_IN_MINUTES", "30")),
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
  smtpFrom:     optional("SMTP_FROM",   "ArchFlow <noreply@archflow.com.br>"),
  emailEnabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),

  // ── URLs ───────────────────────────────────────────────────────────────────
  frontendUrl:               optional("FRONTEND_URL",               "http://localhost:3001"),
  appUrl:                    optional("NEXT_PUBLIC_APP_URL",         "http://localhost:3000"),

  // ── Runtime ────────────────────────────────────────────────────────────────
  nodeEnv:                   optional("NODE_ENV",                   "development"),
  isDev:                     optional("NODE_ENV",                   "development") !== "production",
} as const
