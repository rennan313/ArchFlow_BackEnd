import jwt from "jsonwebtoken"
import { env } from "@/lib/env"

export interface JwtPayload {
  sub:            string
  email:          string
  role:           string
  workspaceId?:   string | null
  workspaceRole?: string
  /** JWT ID — present in refresh tokens for DB-backed replay protection */
  jti?:           string
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions)
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as JwtPayload
}

export function buildPayload(user: {
  id:             string
  email:          string
  role:           string
  workspaceId?:   string | null
  workspaceRole?: string
}): JwtPayload {
  return {
    sub:           user.id,
    email:         user.email,
    role:          user.role,
    workspaceId:   user.workspaceId ?? null,
    workspaceRole: user.workspaceRole ?? "OWNER",
  }
}
