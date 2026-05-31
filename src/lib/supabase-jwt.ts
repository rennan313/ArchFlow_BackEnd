import { createClient } from "@supabase/supabase-js"
import { env } from "@/lib/env"
import { logger } from "@/lib/logger"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SupabaseJwtPayload {
  /** Supabase auth.users UUID */
  sub:   string
  email: string
}

export class SupabaseJwtError extends Error {
  constructor(
    public readonly code:
      | "MISSING_HEADER"
      | "INVALID_TOKEN"
      | "MISSING_EMAIL",
    message: string,
  ) {
    super(message)
    this.name = "SupabaseJwtError"
  }
}

// ── Admin client (singleton) ──────────────────────────────────────────────────

let _admin: ReturnType<typeof createClient> | null = null

function getAdmin() {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _admin
}

// ── Verifier ──────────────────────────────────────────────────────────────────

/**
 * Validates a Supabase access_token by calling supabase.auth.getUser().
 *
 * This is Supabase's recommended server-side token validation approach for
 * modern projects. It does not require SUPABASE_JWT_SECRET and works
 * regardless of whether the project uses HS256 or RS256 signing.
 *
 * @throws {SupabaseJwtError} on any validation failure
 */
export async function verifySupabaseJwt(
  authorizationHeader: string | null,
): Promise<SupabaseJwtPayload> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new SupabaseJwtError(
      "MISSING_HEADER",
      "Authorization header with 'Bearer <token>' is required",
    )
  }

  const token = authorizationHeader.slice(7).trim()
  if (!token) {
    throw new SupabaseJwtError("MISSING_HEADER", "Bearer token is empty")
  }

  const { data: { user }, error } = await getAdmin().auth.getUser(token)

  if (error || !user) {
    logger.warn({ err: error?.message }, "[supabase-jwt] Token validation failed")
    throw new SupabaseJwtError("INVALID_TOKEN", "Invalid or expired Supabase token")
  }

  if (!user.email) {
    throw new SupabaseJwtError("MISSING_EMAIL", "User has no email — cannot provision")
  }

  return { sub: user.id, email: user.email }
}
