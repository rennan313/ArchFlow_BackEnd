import { prisma } from "@/lib/prisma"
import { PLAN_LIMITS, unlimited, type PlanName } from "@/config/plans"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { emailService } from "@/services/email/email.service"
import { resolveOwnerContact } from "@/utils/workspaceOwner"
import type { Subscription } from "@prisma/client"

export interface LimitCheckResult {
  allowed:    boolean
  reason?:    string
  limit?:     number
  current?:   number
  plan:       PlanName
}

// UI-facing access tier, derived from SubscriptionStatus (Story 8). `full` =
// read+write; `limited` = PAUSED (gateway pause — resumable, distinct messaging);
// `readonly` = PAST_DUE/CANCELED/EXPIRED (writes blocked, reactivation CTA).
// Writes are actually gated by canWrite() below — this is only for the frontend
// to show the right banner/CTA. Kept in sync with canWrite by construction:
// only `full` is writable.
export type AccessLevel = "full" | "limited" | "readonly"

const TRIAL_DURATION_DAYS = 30

export const subscriptionService = {
  async getWorkspacePlan(workspaceId: string): Promise<PlanName> {
    const ws = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { plan: true },
    })
    return (ws?.plan ?? "STARTER") as PlanName
  },

  /** Resolves which PLAN_LIMITS apply right now. A workspace in an active
   *  trial gets PLAN_LIMITS.STUDIO regardless of its nominal Workspace.plan —
   *  "all features unlocked" during the 30-day trial, with no free tier to
   *  fall back to once it lapses. Routes through expireTrialIfNeeded so a
   *  trial whose date has passed is treated as expired even before the lazy
   *  status flip has physically happened. */
  async getEffectiveLimits(workspaceId: string) {
    const [plan, sub] = await Promise.all([
      this.getWorkspacePlan(workspaceId),
      this.expireTrialIfNeeded(workspaceId),
    ])
    const inActiveTrial = sub?.status === "TRIAL"
    const limits = inActiveTrial ? PLAN_LIMITS.STUDIO : PLAN_LIMITS[plan]
    return { plan, limits, inActiveTrial }
  },

  async getLimits(workspaceId: string) {
    const { plan, limits } = await this.getEffectiveLimits(workspaceId)
    return { plan, limits }
  },

  // ─── Individual checks ─────────────────────────────────────────────────────

  async canAddUser(workspaceId: string): Promise<LimitCheckResult> {
    const { plan, limits } = await this.getEffectiveLimits(workspaceId)

    if (unlimited(limits.maxUsers)) return { allowed: true, plan }

    const current = await prisma.user.count({ where: { workspaceId } })

    if (current >= limits.maxUsers) {
      return {
        allowed: false,
        plan,
        current,
        limit:  limits.maxUsers,
        reason: `Plan ${plan} allows ${limits.maxUsers} user(s). You have ${current}. Upgrade to add more.`,
      }
    }
    return { allowed: true, plan, current, limit: limits.maxUsers }
  },

  async canCreateProposal(workspaceId: string): Promise<LimitCheckResult> {
    const { plan, limits } = await this.getEffectiveLimits(workspaceId)

    if (unlimited(limits.maxProposalsPerMonth)) return { allowed: true, plan }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const current = await prisma.proposal.count({
      where: {
        workspaceId,
        createdAt: { gte: startOfMonth },
      },
    })

    if (current >= limits.maxProposalsPerMonth) {
      return {
        allowed: false,
        plan,
        current,
        limit:  limits.maxProposalsPerMonth,
        reason: `Plan ${plan} allows ${limits.maxProposalsPerMonth} proposals/month. You've used ${current}. Upgrade or wait for next month.`,
      }
    }
    return { allowed: true, plan, current, limit: limits.maxProposalsPerMonth }
  },

  async canUploadFile(workspaceId: string, fileSizeMb: number): Promise<LimitCheckResult> {
    const { plan, limits } = await this.getEffectiveLimits(workspaceId)

    if (unlimited(limits.maxStorageMb)) return { allowed: true, plan }

    // Count approximate storage used (sum of media assets)
    const mediaCount = await prisma.proposalMedia.count({ where: { proposal: { workspaceId } } })
    const estimatedMbUsed = mediaCount * 2 // rough 2 MB average per asset

    if (estimatedMbUsed + fileSizeMb > limits.maxStorageMb) {
      return {
        allowed: false,
        plan,
        current: estimatedMbUsed,
        limit:   limits.maxStorageMb,
        reason:  `Storage limit of ${limits.maxStorageMb} MB reached on plan ${plan}. Upgrade to upload more files.`,
      }
    }
    return { allowed: true, plan }
  },

  async canUseFeature(workspaceId: string, feature: keyof typeof PLAN_LIMITS["STARTER"]): Promise<LimitCheckResult> {
    const { plan, limits } = await this.getEffectiveLimits(workspaceId)
    const allowed = !!limits[feature]

    return {
      allowed,
      plan,
      reason: allowed ? undefined : `Feature "${String(feature)}" is not available on plan ${plan}. Upgrade to access it.`,
    }
  },

  // ─── Summary ─────────────────────────────────────────────────────────────────

  async getUsageSummary(workspaceId: string) {
    // expireTrialIfNeeded (not a raw findByWorkspace) so a lapsed trial reads
    // as EXPIRED here even on the very first read after trialEndsAt passes.
    // Called once and reused below — getEffectiveLimits is not used here to
    // avoid resolving the same subscription twice in one request.
    const [plan, sub] = await Promise.all([
      this.getWorkspacePlan(workspaceId),
      this.expireTrialIfNeeded(workspaceId),
    ])
    const inActiveTrial = sub?.status === "TRIAL"
    const limits = inActiveTrial ? PLAN_LIMITS.STUDIO : PLAN_LIMITS[plan]

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [userCount, proposalsThisMonth, projectCount] = await Promise.all([
      prisma.user.count({ where: { workspaceId } }),
      prisma.proposal.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } }),
      prisma.project.count({ where: { workspaceId } }),
    ])

    return {
      plan,
      usage: {
        users: {
          current:   userCount,
          limit:     limits.maxUsers,
          unlimited: unlimited(limits.maxUsers),
        },
        proposalsThisMonth: {
          current:   proposalsThisMonth,
          limit:     limits.maxProposalsPerMonth,
          unlimited: unlimited(limits.maxProposalsPerMonth),
        },
        projects: {
          current:   projectCount,
          limit:     limits.maxProjects,
          unlimited: unlimited(limits.maxProjects),
        },
      },
      features: {
        customBranding: limits.canCustomBranding,
        exportPdf:      limits.canExportPdf,
        apiAccess:      limits.canApiAccess,
      },
      subscription: sub ? {
        status:            sub.status,
        accessLevel:       this.getAccessLevel(sub),
        billingCycle:      sub.billingCycle,
        trialStartedAt:    sub.trialStartedAt,
        trialEndsAt:       sub.trialEndsAt,
        currentPeriodEnd:  sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        daysLeft:          this.daysLeftInTrial(sub),
        isReadOnly:        !(sub.status === "ACTIVE" || sub.status === "TRIAL"),
      } : null,
    }
  },

  // ─── Lifecycle (Phase 1 foundation — no payment gateway wired up yet) ───────
  //
  // Workspace.plan stays the field every limit-check method above already
  // reads — left untouched on purpose, zero behavior change for existing
  // code. Subscription is the new authoritative lifecycle record; changePlan
  // is the one place that writes both, so they can never drift apart.

  async getActiveSubscription(workspaceId: string): Promise<Subscription | null> {
    return subscriptionRepository.findByWorkspace(workspaceId)
  },

  /** Get-or-create: returns the existing Subscription, or lazily creates a
   *  trial one if this workspace predates the billing foundation (Phase 1
   *  migration covers the bulk case; this is the safety net for any gap). */
  async ensureSubscription(workspaceId: string): Promise<Subscription> {
    const existing = await subscriptionRepository.findByWorkspace(workspaceId)
    if (existing) return existing
    return this.createTrialSubscription(workspaceId)
  },

  async createTrialSubscription(workspaceId: string, plan: PlanName = "STARTER"): Promise<Subscription> {
    const existing = await subscriptionRepository.findByWorkspace(workspaceId)
    if (existing) throw new AppError(ErrorCode.SUBSCRIPTION_ALREADY_EXISTS)

    const now         = new Date()
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)

    return subscriptionRepository.create({
      workspaceId,
      plan,
      status:             "TRIAL",
      billingCycle:       "MONTHLY",
      trialStartedAt:     now,
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd:   trialEndsAt,
    })
  },

  /** Changes the plan immediately, keeping Subscription and Workspace.plan in
   *  sync in one transaction. Phase 1 has no payment gateway, so this is
   *  intentionally synchronous/unconditional — Phase 2 moves the actual
   *  activation into the Mercado Pago webhook handler, with this method (or
   *  one shaped like it) called only after a payment is confirmed. */
  async changePlan(workspaceId: string, plan: PlanName, billingCycle?: "MONTHLY" | "ANNUAL"): Promise<Subscription> {
    const existing = await subscriptionRepository.findByWorkspace(workspaceId)
    if (!existing) throw new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND)

    const [, updated] = await prisma.$transaction([
      prisma.workspace.update({ where: { id: workspaceId }, data: { plan } }),
      prisma.subscription.update({
        where: { workspaceId },
        data: {
          plan,
          status:       "ACTIVE",
          billingCycle: billingCycle ?? existing.billingCycle,
        },
      }),
    ])

    return updated
  },

  /** Marks the subscription to stop renewing at the end of the current
   *  period — access is NOT revoked immediately. A future scheduled job
   *  (Phase 2/3) is responsible for actually downgrading once
   *  currentPeriodEnd passes; this method only records the intent. */
  async cancelSubscription(workspaceId: string): Promise<Subscription> {
    const existing = await subscriptionRepository.findByWorkspace(workspaceId)
    if (!existing) throw new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND)

    return subscriptionRepository.update(workspaceId, {
      cancelAtPeriodEnd: true,
      canceledAt:        new Date(),
    })
  },

  /** Undoes a pending cancellation, as long as the period hasn't ended yet. */
  async reactivateSubscription(workspaceId: string): Promise<Subscription> {
    const existing = await subscriptionRepository.findByWorkspace(workspaceId)
    if (!existing) throw new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND)

    return subscriptionRepository.update(workspaceId, {
      cancelAtPeriodEnd: false,
      canceledAt:        null,
    })
  },

  isTrialExpired(subscription: Subscription): boolean {
    return subscription.status === "TRIAL"
      && !!subscription.trialEndsAt
      && subscription.trialEndsAt.getTime() < Date.now()
  },

  /** Lazily checked on read (no scheduler exists yet in Phase 1) — the single
   *  place every other method routes through to get an up-to-date
   *  Subscription. Two responsibilities, both about never returning stale
   *  state:
   *   1. Self-heals a workspace with no Subscription row at all (legacy data
   *      predating eager creation in workspaceService.createForUser, or any
   *      gap the Phase 1 backfill missed) by granting it a fresh 30-day
   *      trial, instead of leaving canWrite/getUsageSummary to disagree about
   *      whether a workspace with no row is blocked.
   *   2. Flips a lapsed trial to EXPIRED. With no free tier, this is *not* a
   *      downgrade to a usable plan (the old behavior fell back to STARTER)
   *      — EXPIRED is read-only via canWrite() until the OWNER pays.
   *      Workspace.plan is left untouched so changePlan() has the right
   *      nominal plan to reactivate into. */
  async expireTrialIfNeeded(workspaceId: string): Promise<Subscription> {
    const existing = await subscriptionRepository.findByWorkspace(workspaceId)
    if (!existing) return this.createTrialSubscription(workspaceId)
    if (!this.isTrialExpired(existing)) return existing

    const updated = await subscriptionRepository.update(workspaceId, { status: "EXPIRED" })
    // Fires exactly once — the flip only happens while status is still TRIAL.
    // Fire-and-forget: expireTrialIfNeeded is on the hot write-gate path, so the
    // email must never block it or throw into it (Story 11).
    void resolveOwnerContact(workspaceId)
      .then((c) => (c ? emailService.sendTrialExpired({ to: c.email, name: c.name }) : undefined))
      .catch((err) => logger.error({ workspaceId, err: String(err) }, "[billing] trial-expired email failed (non-fatal)"))
    return updated
  },

  /** Single fast check used by withWorkspace on every write request. ACTIVE
   *  and a not-yet-expired TRIAL are writable; EXPIRED/CANCELED/PAST_DUE/PAUSED
   *  are read-only. Goes through expireTrialIfNeeded so a trial whose date has
   *  passed is already reported as EXPIRED here, even before this exact
   *  request, by being the first to notice. */
  async canWrite(workspaceId: string): Promise<boolean> {
    const sub = await this.expireTrialIfNeeded(workspaceId)
    return sub.status === "ACTIVE" || sub.status === "TRIAL"
  },

  /** Pure — maps a status to the UI access tier (Story 8). Only "full" is
   *  writable, so this can never disagree with canWrite(). */
  getAccessLevel(subscription: Subscription): AccessLevel {
    if (subscription.status === "ACTIVE" || subscription.status === "TRIAL") return "full"
    if (subscription.status === "PAUSED") return "limited"
    return "readonly" // PAST_DUE | CANCELED | EXPIRED
  },

  /** Pure — days remaining in an active trial, rounded up so "less than a
   *  day left" still reads as 1, not 0, until it actually expires. null when
   *  not applicable (not in TRIAL, or no trialEndsAt) rather than 0, so the
   *  frontend can tell "not on a trial" apart from "trial ends today". */
  daysLeftInTrial(subscription: Subscription): number | null {
    if (subscription.status !== "TRIAL" || !subscription.trialEndsAt) return null
    const ms = subscription.trialEndsAt.getTime() - Date.now()
    return Math.max(0, Math.ceil(ms / 86_400_000))
  },
}
