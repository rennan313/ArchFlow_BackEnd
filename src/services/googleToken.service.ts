import { OAuth2Client } from "google-auth-library"
import { env } from "@/lib/env"
import { AppError, ErrorCode } from "@/lib/errors"

export interface GoogleUserInfo {
  googleId: string
  email:    string
  name:     string
  avatar?:  string
}

// Client is re-used across requests — OAuth2Client is safe to share
let _client: OAuth2Client | null = null

function getClient(): OAuth2Client {
  if (!env.googleClientId) {
    throw new AppError(ErrorCode.GOOGLE_AUTH_DISABLED, "GOOGLE_CLIENT_ID is not configured")
  }
  if (!_client) _client = new OAuth2Client(env.googleClientId)
  return _client
}

export const googleTokenService = {
  async verify(idToken: string): Promise<GoogleUserInfo> {
    const client = getClient()

    let ticket
    try {
      ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId })
    } catch {
      throw new AppError(ErrorCode.GOOGLE_TOKEN_INVALID, "Google ID token verification failed")
    }

    const payload = ticket.getPayload()
    if (!payload) {
      throw new AppError(ErrorCode.GOOGLE_TOKEN_INVALID, "Empty token payload")
    }

    if (!payload.email_verified) {
      throw new AppError(ErrorCode.GOOGLE_TOKEN_INVALID, "Google account email is not verified")
    }

    if (!payload.email) {
      throw new AppError(ErrorCode.GOOGLE_TOKEN_INVALID, "Google token is missing email claim")
    }

    return {
      googleId: payload.sub,
      email:    payload.email,
      name:     payload.name ?? payload.email.split("@")[0],
      avatar:   payload.picture ?? undefined,
    }
  },
}
