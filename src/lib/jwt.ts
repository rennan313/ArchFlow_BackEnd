import jwt from "jsonwebtoken"

const JWT_SECRET             = process.env.JWT_SECRET!
const JWT_REFRESH_SECRET     = process.env.JWT_REFRESH_SECRET!
const JWT_EXPIRES_IN         = process.env.JWT_EXPIRES_IN         ?? "15m"
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d"

export interface JwtPayload {
  sub:                  string
  email:                string
  role:                 string
  workspaceType?:       string | null
  onboardingCompleted?: boolean
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload
}

export function buildPayload(user: {
  id:                  string
  email:               string
  role:                string
  workspaceType?:      string | null
  onboardingCompleted?: boolean
}): JwtPayload {
  return {
    sub:                 user.id,
    email:               user.email,
    role:                user.role,
    workspaceType:       user.workspaceType ?? null,
    onboardingCompleted: user.onboardingCompleted ?? false,
  }
}
