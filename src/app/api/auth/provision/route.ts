import { type NextRequest } from "next/server"
import { z } from "zod"
import { verifySupabaseJwt, SupabaseJwtError } from "@/lib/supabase-jwt"
import { provisionService } from "@/services/provision.service"
import { created, unauthorized, internalError } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { authRateLimit } from "@/middlewares/rateLimiter"
import { logger } from "@/lib/logger"

// ── Request validation ────────────────────────────────────────────────────────

const provisionSchema = z.object({
  // Optional — the email-confirmation callback flow does not have the name;
  // the service falls back to the local part of the email address.
  name: z
    .string()
    .max(100, "name must be at most 100 characters")
    .trim()
    .optional(),

  // Optional — when absent (email-confirmation callback flow) the service
  // stores a cryptographically random unguessable hash. The user authenticates
  // via the post-confirm handoff token and can set a real password later via
  // "Forgot password".
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .optional(),
})

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/provision
 *
 * Phase 1 — Registration migration endpoint.
 *
 * Provisions a MongoDB User and Workspace for a user who has just registered
 * in Supabase Auth via supabase.auth.signUp(). Must be called immediately after
 * signUp() returns a session, before the NextAuth signIn() call.
 *
 * ─── Request ────────────────────────────────────────────────────────────────
 * Authorization: Bearer <supabase_access_token>
 * Content-Type:  application/json
 * { "name": "João da Silva", "password": "MyP4ssword" }
 *
 * ─── Responses ──────────────────────────────────────────────────────────────
 * 201  { success, data: { user, accessToken, alreadyProvisioned } }
 * 400  Validation error (missing or invalid body fields)
 * 401  Missing / expired / invalid Supabase token
 * 409  Email already registered under a different account
 * 429  Rate limit exceeded
 * 500  Unexpected server error
 *
 * ─── Security ───────────────────────────────────────────────────────────────
 * • Supabase JWT verified with SUPABASE_JWT_SECRET (HS256) before any write.
 * • Email and supabaseId extracted exclusively from the verified token — never
 *   from the request body. This prevents identity spoofing.
 * • Password is hashed with bcrypt (12 rounds) before storage.
 * • Idempotent: safe to call multiple times for the same user.
 * • Rate-limited at 10 requests / minute / IP.
 *
 * ─── Phase 5 note ───────────────────────────────────────────────────────────
 * The password is stored in MongoDB so that the NextAuth credentials flow
 * (/api/auth/login) continues to work for existing users. This field will be
 * removed from MongoDB in Phase 6 once the Supabase migration completes.
 * when login is migrated to supabase.auth.signInWithPassword().
 */
export async function POST(req: NextRequest) {
  // ── Rate limiting ─────────────────────────────────────────────────────────
  const limited = authRateLimit(req)
  if (limited) return limited

  // ── 1. Verify Supabase JWT ────────────────────────────────────────────────
  let supabaseId: string
  let email:      string

  try {
    const claims = verifySupabaseJwt(req.headers.get("authorization"))
    supabaseId   = claims.sub
    email        = claims.email
  } catch (err) {
    if (err instanceof SupabaseJwtError) {
      // MISSING_SECRET indicates a server misconfiguration — don't leak details
      if (err.code === "MISSING_SECRET") {
        logger.error("[provision] SUPABASE_JWT_SECRET not configured")
        return internalError("Authentication service misconfigured")
      }
      return unauthorized(err.message)
    }
    logger.error({ err }, "[provision] Unexpected JWT verification error")
    return unauthorized("Token verification failed")
  }

  // ── 2. Parse and validate body ────────────────────────────────────────────
  let input: z.infer<typeof provisionSchema>
  try {
    const body = await req.json()
    input      = provisionSchema.parse(body)
  } catch (err) {
    return handleServiceError(err)
  }

  // ── 3. Provision user via service ─────────────────────────────────────────
  try {
    const result = await provisionService.provision({
      supabaseId,
      email,
      name:     input.name,
      password: input.password,
    })

    const message = result.alreadyProvisioned
      ? "User already provisioned"
      : "User provisioned successfully"

    return created(result, message)
  } catch (error) {
    return handleServiceError(error)
  }
}
