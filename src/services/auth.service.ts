import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { userRepository } from "@/repositories/user.repository"
import { resetTokenRepository } from "@/repositories/resetToken.repository"
import { emailVerificationTokenRepository } from "@/repositories/emailVerificationToken.repository"
import { refreshTokenRepository } from "@/repositories/refreshToken.repository"
import { hashPassword, comparePassword } from "@/lib/hash"
import { buildPayload, signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt"
import type { JwtPayload } from "@/lib/jwt"
import { workspaceService } from "@/services/workspace.service"
import { googleTokenService } from "@/services/googleToken.service"
import { AppError, ErrorCode } from "@/lib/errors"
import { env } from "@/lib/env"
import { emitEvent, emitErrorEvent } from "@/lib/events"
import type { ResetPasswordInput, LoginInput, CredentialsRegisterInput, VerifyEmailInput } from "@/validations/auth"

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Parse "30d" / "7d" / "1h" → milliseconds */
function parseExpiryMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/)
  if (!match) return 30 * 24 * 60 * 60 * 1_000
  const value = parseInt(match[1], 10)
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }
  return value * (multipliers[match[2]] ?? 86_400_000)
}

/** Issue a signed refresh JWT and persist a hashed record for replay protection. */
async function issueRefreshToken(
  userId:  string,
  payload: JwtPayload,
  meta?:   { ip?: string; userAgent?: string },
): Promise<string> {
  const jti       = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + parseExpiryMs(env.jwtRefreshExpiresIn))

  await refreshTokenRepository.create({
    userId,
    jti,
    expiresAt,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  })

  return signRefreshToken({ ...payload, jti })
}

/** Shape of the auth response returned by all sign-in / token-refresh methods. */
interface AuthTokens {
  accessToken:  string
  refreshToken: string
  user: {
    id:    string
    name:  string
    email: string
    avatar: string | null
    role:  string
  }
}

function buildAuthTokens(
  accessToken:  string,
  refreshToken: string,
  user: {
    id:           string
    name:         string
    email:        string
    image?:       string | null
    workspaceRole: string
  },
): AuthTokens {
  return {
    accessToken,
    refreshToken,
    user: {
      id:     user.id,
      name:   user.name,
      email:  user.email,
      avatar: user.image ?? null,
      role:   user.workspaceRole.toLowerCase(),
    },
  }
}

export const authService = {
  async me(userId: string) {
    const user = await userRepository.findById(userId)
    if (!user) throw new AppError(ErrorCode.USER_NOT_FOUND)
    return {
      id:                  user.id,
      name:                user.name,
      email:               user.email,
      image:               user.image,
      role:                user.role,
      provider:            user.provider,
      onboardingCompleted: user.onboardingCompleted,
      onboardingStep:      user.onboardingStep,
      workspaceType:       user.workspaceType,
      teamSize:            user.teamSize,
      primaryGoal:         user.primaryGoal,
      lastLogin:           user.lastLogin,
      createdAt:           user.createdAt,
      updatedAt:           user.updatedAt,
    }
  },

  async login(input: LoginInput, meta?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.findByEmail(input.email)
    if (!user) {
      emitErrorEvent("auth.login.failure", { email: input.email, reason: "user_not_found" })
      throw new AppError(ErrorCode.INVALID_CREDENTIALS)
    }
    if (!user.password) {
      emitErrorEvent("auth.login.failure", { userId: user.id, reason: "google_account" })
      throw new AppError(ErrorCode.USE_GOOGLE)
    }

    const valid = await comparePassword(input.password, user.password)
    if (!valid) {
      emitErrorEvent("auth.login.failure", { userId: user.id, reason: "wrong_password" })
      throw new AppError(ErrorCode.INVALID_CREDENTIALS)
    }

    await userRepository.update(user.id, { lastLogin: new Date() })
    emitEvent("auth.login.success", { userId: user.id, email: user.email })

    const payload      = buildPayload(user)
    const accessToken  = signAccessToken(payload)
    const refreshToken = await issueRefreshToken(user.id, payload, meta)

    return {
      accessToken,
      refreshToken,
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        image:               user.image,
        role:                user.role,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep:      user.onboardingStep,
      },
    }
  },

  async forgotPassword({ email }: { email: string }) {
    const user = await userRepository.findByEmail(email)
    if (!user || !user.password) return null

    const rawToken  = crypto.randomUUID()
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex")
    const expiresAt = new Date(Date.now() + env.resetPasswordExpiresMin * 60_000)

    await resetTokenRepository.deleteByUserId(user.id)
    await resetTokenRepository.create(user.id, tokenHash, expiresAt)

    emitEvent("auth.password_reset.requested", { userId: user.id, email: user.email })
    return { user, token: rawToken }
  },

  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex")
    const record    = await resetTokenRepository.findByToken(tokenHash)

    if (!record || record.used || record.expiresAt < new Date()) {
      throw new AppError(ErrorCode.INVALID_OR_EXPIRED_TOKEN)
    }

    const hashed = await hashPassword(input.password)
    await userRepository.update(record.userId, { password: hashed })
    await resetTokenRepository.markUsed(record.id)
    emitEvent("auth.password_reset.completed", { userId: record.userId })
  },

  // ─── Email verification ────────────────────────────────────────────────────

  async sendEmailVerification({ email }: { email: string }) {
    const user = await userRepository.findByEmail(email)
    if (!user) {
      emitErrorEvent("auth.email_verification.failure", { email, reason: "user_not_found" })
      return null
    }
    if (user.emailVerified) {
      emitEvent("auth.email_verification.already_verified", { userId: user.id, email: user.email })
      return null
    }

    const rawToken  = crypto.randomUUID()
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex")
    const expiresAt = new Date(Date.now() + env.emailVerificationExpiresMin * 60_000)

    await emailVerificationTokenRepository.deleteByUserId(user.id)
    await emailVerificationTokenRepository.create(user.id, tokenHash, expiresAt)

    emitEvent("auth.email_verification.requested", { userId: user.id, email: user.email })
    return { user, token: rawToken }
  },

  async verifyEmail(input: VerifyEmailInput) {
    const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex")
    const record    = await emailVerificationTokenRepository.findByToken(tokenHash)

    if (!record || record.used) {
      emitErrorEvent("auth.email_verification.failure", { reason: "invalid_token" })
      throw new AppError(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID)
    }

    if (record.expiresAt < new Date()) {
      emitErrorEvent("auth.email_verification.failure", { userId: record.userId, reason: "token_expired" })
      throw new AppError(ErrorCode.EMAIL_VERIFICATION_TOKEN_EXPIRED)
    }

    const user = await userRepository.findById(record.userId)
    if (!user) {
      emitErrorEvent("auth.email_verification.failure", { userId: record.userId, reason: "user_not_found" })
      throw new AppError(ErrorCode.USER_NOT_FOUND)
    }

    if (user.emailVerified) {
      await emailVerificationTokenRepository.markUsed(record.id)
      emitEvent("auth.email_verification.already_verified", { userId: user.id, email: user.email })
      throw new AppError(ErrorCode.EMAIL_ALREADY_VERIFIED)
    }

    await userRepository.update(user.id, { emailVerified: new Date() })
    await emailVerificationTokenRepository.markUsed(record.id)
    emitEvent("auth.email_verification.completed", { userId: user.id, email: user.email })
  },

  async googleSignIn(input: { email: string; name: string; image?: string | null; googleId: string }) {
    let user = await prisma.user.findUnique({ where: { email: input.email } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email:         input.email,
          name:          input.name,
          image:         input.image ?? null,
          googleId:      input.googleId,
          provider:      "google",
          emailVerified: new Date(), // Google has already verified this email
          lastLogin:     new Date(),
        },
      })
      await workspaceService.createForUser(user.id, user.name)
      user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name:          input.name,
          image:         input.image ?? user.image ?? null,
          googleId:      user.googleId ?? input.googleId,
          emailVerified: user.emailVerified ?? new Date(),
          lastLogin:     new Date(),
        },
      })
      if (!user.workspaceId) {
        await workspaceService.createForUser(user.id, user.name)
        user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
      }
    }

    emitEvent("auth.google.success", { userId: user.id, email: user.email })
    const accessToken = signAccessToken(buildPayload(user))
    return {
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        image:               user.image,
        role:                user.role,
        workspaceId:         user.workspaceId,
        workspaceRole:       user.workspaceRole,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep:      user.onboardingStep,
      },
      accessToken,
    }
  },

  async register(input: CredentialsRegisterInput, meta?: { ip?: string; userAgent?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } })

    if (existing) {
      emitErrorEvent("auth.register.duplicate", { email: input.email })
      if (!existing.password && existing.googleId) {
        throw new AppError(ErrorCode.EMAIL_TAKEN, "This email is already registered with Google. Please sign in with Google.")
      }
      throw new AppError(ErrorCode.EMAIL_TAKEN)
    }

    const hashed = await hashPassword(input.password)
    const user   = await prisma.user.create({
      data: {
        name:          input.name,
        email:         input.email,
        password:      hashed,
        provider:      "credentials",
        workspaceType: input.workspaceType,
        teamSize:      input.teamSize,
        primaryGoal:   input.primaryGoal,
        lastLogin:     new Date(),
      },
    })

    await workspaceService.createForUser(user.id, user.name)
    const provisioned  = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    const payload      = buildPayload(provisioned)
    const accessToken  = signAccessToken(payload)
    const refreshToken = await issueRefreshToken(provisioned.id, payload, meta)
    emitEvent("auth.register.success", { userId: provisioned.id, email: provisioned.email, workspaceId: provisioned.workspaceId ?? undefined })

    return {
      accessToken,
      refreshToken,
      user: {
        id:                  provisioned.id,
        name:                provisioned.name,
        email:               provisioned.email,
        image:               provisioned.image,
        role:                provisioned.role,
        workspaceId:         provisioned.workspaceId,
        workspaceRole:       provisioned.workspaceRole,
        onboardingCompleted: provisioned.onboardingCompleted,
        onboardingStep:      provisioned.onboardingStep,
      },
    }
  },

  // ─── Google OAuth (secure — validates Google ID Token server-side) ────────

  async googleAuth(
    input: { idToken: string },
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    // 1. Validate the Google ID Token via Google's servers
    const googleUser = await googleTokenService.verify(input.idToken)

    // 2. Resolve user: prefer googleId lookup, fall back to email
    let user =
      (await userRepository.findByGoogleId(googleUser.googleId)) ??
      (await userRepository.findByEmail(googleUser.email))

    if (!user) {
      // 3a. New user — create account + provision workspace
      user = await prisma.user.create({
        data: {
          email:         googleUser.email,
          name:          googleUser.name,
          image:         googleUser.avatar ?? null,
          googleId:      googleUser.googleId,
          provider:      "google",
          emailVerified: new Date(), // Google has already verified this email
          lastLogin:     new Date(),
        },
      })
      await workspaceService.createForUser(user.id, user.name)
      user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    } else {
      // 3b. Existing user — update avatar and last login
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          image:         googleUser.avatar ?? user.image ?? null,
          googleId:      user.googleId ?? googleUser.googleId,
          emailVerified: user.emailVerified ?? new Date(),
          lastLogin:     new Date(),
        },
      })
      if (!user.workspaceId) {
        await workspaceService.createForUser(user.id, user.name)
        user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
      }
    }

    emitEvent("auth.google.success", { userId: user.id, email: user.email })

    // 4. Issue ArchFlow JWT pair — Google token is never forwarded
    const payload      = buildPayload(user)
    const accessToken  = signAccessToken(payload)
    const refreshToken = await issueRefreshToken(user.id, payload, meta)

    return buildAuthTokens(accessToken, refreshToken, {
      id:            user.id,
      name:          user.name,
      email:         user.email,
      image:         user.image,
      workspaceRole: user.workspaceRole,
    })
  },

  // ─── Refresh Token rotation ───────────────────────────────────────────────

  async refreshTokens(
    token: string,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // 1. Verify JWT signature + expiry
    let decoded: JwtPayload
    try {
      decoded = verifyRefreshToken(token)
    } catch {
      throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN)
    }

    // 2. Require jti — tokens issued without DB backing are rejected
    if (!decoded.jti) {
      throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN)
    }

    // 3. DB check for replay protection
    const stored = await refreshTokenRepository.findByJti(decoded.jti)
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN)
    }

    // 4. Rotate: revoke the consumed token immediately
    await refreshTokenRepository.revoke(stored.id)

    // 5. Fetch up-to-date user (role / workspace may have changed)
    const user = await userRepository.findById(decoded.sub)
    if (!user) throw new AppError(ErrorCode.USER_NOT_FOUND)

    // 6. Issue a fresh pair
    const payload         = buildPayload(user)
    const newAccessToken  = signAccessToken(payload)
    const newRefreshToken = await issueRefreshToken(user.id, payload, meta)

    return { accessToken: newAccessToken, refreshToken: newRefreshToken }
  },
}
