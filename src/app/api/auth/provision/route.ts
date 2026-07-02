import { type NextRequest } from "next/server"
import { z } from "zod"
import { verifySupabaseJwt, SupabaseJwtError } from "@/lib/supabase-jwt"
import { provisionService } from "@/services/provision.service"
import { created, unauthorized } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { authRateLimit } from "@/middlewares/rateLimiter"
import { logger } from "@/lib/logger"

// ── Request validation ────────────────────────────────────────────────────────

const provisionSchema = z.object({
  name: z
    .string()
    .max(100, "name must be at most 100 characters")
    .trim()
    .optional(),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .optional(),
})

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/provision
 *
 * Provisions a MongoDB User and Workspace for a user who has just registered
 * in Supabase Auth via supabase.auth.signUp(). Called immediately after
 * signUp() returns a session, before the NextAuth signIn() call.
 *
 * Token validation uses supabase.auth.getUser() — the officially recommended
 * Supabase approach for modern projects. No SUPABASE_JWT_SECRET required.
 *
 * ─── Security ───────────────────────────────────────────────────────────────
 * • Supabase token verified via admin client before any write.
 * • Email and supabaseId extracted from verified user object — never from body.
 * • Password is hashed with bcrypt (12 rounds) before storage.
 * • Idempotent: safe to call multiple times for the same user.
 * • Rate-limited at 10 requests / minute / IP.
 */
export async function POST(req: NextRequest) {
  const limited = await authRateLimit(req)
  if (limited) return limited

  // ── 1. Verify Supabase token via admin client ─────────────────────────────
  let supabaseId: string
  let email:      string

  try {
    const claims = await verifySupabaseJwt(req.headers.get("authorization"))
    supabaseId   = claims.sub
    email        = claims.email
  } catch (err) {
    if (err instanceof SupabaseJwtError) {
      logger.warn({ code: err.code }, "[provision] Token validation failed")
      return unauthorized(err.message)
    }
    logger.error({ err }, "[provision] Unexpected token verification error")
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

    return created(
      result,
      result.alreadyProvisioned ? "User already provisioned" : "User provisioned successfully",
    )
  } catch (error) {
    return handleServiceError(error)
  }
}
