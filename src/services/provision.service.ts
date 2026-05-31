import { Prisma } from "@prisma/client"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { hashPassword } from "@/lib/hash"
import { buildPayload, signAccessToken } from "@/lib/jwt"
import { workspaceService } from "@/services/workspace.service"
import { logger } from "@/lib/logger"
import type { User } from "@prisma/client"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProvisionInput {
  /** Supabase auth.users UUID — extracted from the verified JWT, never from the body */
  supabaseId: string
  /** Email extracted from the verified JWT — source of truth for this field */
  email:      string
  /**
   * Display name from the registration form.
   * Optional — falls back to the local part of the email address when absent
   * (e.g. email-confirmation callback flow where the name is unknown).
   */
  name?:      string
  /**
   * Plain-text password from the registration form.
   *
   * PHASE 5 NOTE:
   * Stored as a bcrypt hash so that the NextAuth credentials flow (/api/auth/login)
   * continues to work for existing users. This field will be removed when the
   * Supabase migration completes and login is migrated to supabase.auth.signInWithPassword().
   *
   * When absent (email-confirmation callback flow), a cryptographically
   * random unguessable hash is stored. The user authenticates via the
   * post-confirm handoff token and can set a real password via
   * "Forgot password" later.
   */
  password?:  string
}

export interface ProvisionResult {
  user: {
    id:                  string
    supabaseId:          string
    email:               string
    name:                string
    role:                string
    workspaceId:         string | null
    workspaceRole:       string
    onboardingCompleted: boolean
    onboardingStep:      number
  }
  /** Backend JWT — used by the NextAuth credentials flow (/api/auth/login) */
  accessToken:        string
  /** True when the user was already provisioned (idempotent call) */
  alreadyProvisioned: boolean
}

// ── Service ───────────────────────────────────────────────────────────────────

export const provisionService = {
  /**
   * Creates a MongoDB User + Workspace for a Supabase Auth user.
   *
   * BEHAVIOUR:
   *   • If the user is already fully provisioned (same supabaseId) → idempotent
   *     success. If the workspace was missing (partial failure on a prior call),
   *     it is created now before returning.
   *   • If the email exists in MongoDB WITHOUT a supabaseId → pre-migration user.
   *     Returns EMAIL_TAKEN — they must log in via existing credentials.
   *   • If the email exists WITH a different supabaseId → conflict, returns EMAIL_TAKEN.
   *   • Otherwise → create User + Workspace.
   *
   * IDEMPOTENCY + RACE CONDITION PROTECTION:
   *   Safe to call concurrently. If two requests race past the findFirst check
   *   and both attempt user.create(), the loser catches Prisma P2002, re-fetches
   *   the winning record, and returns as idempotent. Workspace creation is guarded
   *   by a workspaceId null-check so a second call never creates a duplicate.
   */
  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const resolvedName =
      input.name?.trim() ||
      input.email.split("@")[0] ||
      "User"

    logger.info(
      `[provision] Starting for supabaseId=${input.supabaseId} email=${input.email}`,
    )

    // ── 1. Check for existing MongoDB record ──────────────────────────────────
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ supabaseId: input.supabaseId }, { email: input.email }],
      },
    })

    if (existing) {
      return this._handleExisting(existing, input)
    }

    // ── 2. Hash password ───────────────────────────────────────────────────────
    // When no password is supplied (email-confirmation callback flow), generate
    // a random 32-byte secret. The resulting hash is unguessable; the user
    // authenticates for this session via the handoff token and can establish a
    // real password later through the "Forgot password" flow.
    const hashedPassword = await hashPassword(
      input.password ?? randomBytes(32).toString("hex"),
    )

    // ── 3. Create MongoDB User — with P2002 guard ─────────────────────────────
    let user: User
    try {
      user = await prisma.user.create({
        data: {
          supabaseId: input.supabaseId,
          name:       resolvedName,
          email:      input.email,
          password:   hashedPassword,
          provider:   "supabase",
          lastLogin:  new Date(),
        },
      })
    } catch (err) {
      // P2002: unique constraint violation — a concurrent request won the race.
      // Re-fetch the winner and return as idempotent.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const winner = await prisma.user.findFirst({
          where: { OR: [{ supabaseId: input.supabaseId }, { email: input.email }] },
        })
        if (winner) return this._handleExisting(winner, input)
      }
      throw err
    }

    logger.info(`[provision] MongoDB user created: id=${user.id} supabaseId=${user.supabaseId}`)

    // ── 4. Create Workspace (user becomes OWNER) ──────────────────────────────
    //
    // workspaceService.createForUser() does:
    //   1. Creates a Workspace document
    //   2. Updates user.workspaceId and user.workspaceRole = "OWNER"
    //
    // We re-fetch afterwards to get the updated workspaceId.
    await workspaceService.createForUser(user.id, user.name)

    const provisioned = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })

    logger.info(
      `[provision] Workspace created: workspaceId=${provisioned.workspaceId} for userId=${provisioned.id}`,
    )

    // ── 5. Issue backend JWT ──────────────────────────────────────────────────
    const accessToken = signAccessToken(buildPayload(provisioned))

    return {
      user:               mapUser(provisioned),
      accessToken,
      alreadyProvisioned: false,
    }
  },

  // ── Private helpers ─────────────────────────────────────────────────────────

  async _handleExisting(existing: User, input: ProvisionInput): Promise<ProvisionResult> {
    // Case A: same supabaseId → already provisioned (or partial failure retry)
    if (existing.supabaseId === input.supabaseId) {
      return this._completeAndReturn(existing)
    }

    // Case B: email exists WITHOUT supabaseId → pre-migration user
    if (!existing.supabaseId) {
      logger.warn(
        `[provision] Pre-migration user attempted new Supabase registration: ` +
        `email=${existing.email} existingId=${existing.id}`,
      )
      throw new AppError(ErrorCode.EMAIL_TAKEN)
    }

    // Case C: email exists WITH a different supabaseId → genuine conflict
    logger.error(
      `[provision] supabaseId conflict: email=${input.email} ` +
      `existing.supabaseId=${existing.supabaseId} incoming=${input.supabaseId}`,
    )
    throw new Error("EMAIL_TAKEN")
  },

  /**
   * Returns an idempotent ProvisionResult for a user that was already created.
   * If the workspace was missing (e.g. workspace creation failed on a previous
   * call), it is completed before returning.
   */
  async _completeAndReturn(existing: User): Promise<ProvisionResult> {
    let user = existing

    if (!existing.workspaceId) {
      logger.info(
        `[provision] Completing missing workspace for userId=${existing.id}`,
      )
      await workspaceService.createForUser(existing.id, existing.name)
      user = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })
    }

    logger.info(
      `[provision] Already provisioned: id=${user.id} supabaseId=${user.supabaseId}`,
    )
    const accessToken = signAccessToken(buildPayload(user))
    return {
      user:               mapUser(user),
      accessToken,
      alreadyProvisioned: true,
    }
  },
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapUser(u: User): ProvisionResult["user"] {
  return {
    id:                  u.id,
    supabaseId:          u.supabaseId ?? "",
    email:               u.email,
    name:                u.name,
    role:                u.role,
    workspaceId:         u.workspaceId ?? null,
    workspaceRole:       u.workspaceRole,
    onboardingCompleted: u.onboardingCompleted,
    onboardingStep:      u.onboardingStep,
  }
}
