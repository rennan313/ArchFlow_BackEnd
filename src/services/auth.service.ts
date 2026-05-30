import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { userRepository } from "@/repositories/user.repository"
import { resetTokenRepository } from "@/repositories/resetToken.repository"
import { hashPassword, comparePassword } from "@/lib/hash"
import { buildPayload, signAccessToken } from "@/lib/jwt"
import { workspaceService } from "@/services/workspace.service"
import { AppError, ErrorCode } from "@/lib/errors"
import { env } from "@/lib/env"
import { emitEvent, emitErrorEvent } from "@/lib/events"
import type { ResetPasswordInput, LoginInput, CredentialsRegisterInput } from "@/validations/auth"

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

  async login(input: LoginInput) {
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

    const accessToken = signAccessToken(buildPayload(user))
    return {
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        image:               user.image,
        role:                user.role,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep:      user.onboardingStep,
      },
      accessToken,
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

  async googleSignIn(input: { email: string; name: string; image?: string | null; googleId: string }) {
    let user = await prisma.user.findUnique({ where: { email: input.email } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email:     input.email,
          name:      input.name,
          image:     input.image ?? null,
          googleId:  input.googleId,
          provider:  "google",
          lastLogin: new Date(),
        },
      })
      await workspaceService.createForUser(user.id, user.name)
      user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name:      input.name,
          image:     input.image ?? user.image ?? null,
          googleId:  user.googleId ?? input.googleId,
          lastLogin: new Date(),
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

  async register(input: CredentialsRegisterInput) {
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
    const provisioned = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    const accessToken = signAccessToken(buildPayload(provisioned))
    emitEvent("auth.register.success", { userId: provisioned.id, email: provisioned.email, workspaceId: provisioned.workspaceId ?? undefined })

    return {
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
      accessToken,
    }
  },
}
