import jwt from "jsonwebtoken"
import { env } from "@/lib/env"
import { logger } from "@/lib/logger"

export interface SupabaseJwtPayload {
  sub:            string
  email:          string
  role:           string
  aud:            string
  iat:            number
  exp:            number
  session_id?:    string
  user_metadata?: Record<string, unknown>
  app_metadata?:  Record<string, unknown>
}

export class SupabaseJwtError extends Error {
  constructor(
    public readonly code:
      | "MISSING_HEADER"
      | "MISSING_SECRET"
      | "EXPIRED"
      | "INVALID_SIGNATURE"
      | "INVALID_ROLE"
      | "MISSING_EMAIL",
    message: string,
  ) {
    super(message)
    this.name = "SupabaseJwtError"
  }
}

export function verifySupabaseJwt(
  authorizationHeader: string | null,
): SupabaseJwtPayload {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new SupabaseJwtError("MISSING_HEADER", "Authorization header with 'Bearer <token>' is required")
  }

  const token = authorizationHeader.slice(7).trim()
  if (!token) {
    throw new SupabaseJwtError("MISSING_HEADER", "Bearer token is empty")
  }

  // env.ts validates SUPABASE_JWT_SECRET at startup — always present here
  let payload: SupabaseJwtPayload
  try {
    payload = jwt.verify(token, env.supabaseJwtSecret) as SupabaseJwtPayload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new SupabaseJwtError("EXPIRED", "Supabase session has expired — please sign in again")
    }
    throw new SupabaseJwtError("INVALID_SIGNATURE", "Invalid Supabase token")
  }

  if (payload.role !== "authenticated") {
    throw new SupabaseJwtError(
      "INVALID_ROLE",
      `Token role '${payload.role}' is not allowed — must be 'authenticated'`,
    )
  }

  if (!payload.email) {
    throw new SupabaseJwtError("MISSING_EMAIL", "Token is missing the email claim")
  }

  return payload
}
