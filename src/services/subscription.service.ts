import { prisma } from "@/lib/prisma"
import { PLAN_LIMITS, unlimited, type PlanName } from "@/config/plans"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { Subscription } from "@prisma/client"

export interface LimitCheckResult {
  allowed:    boolean
  reason?:    string
  limit?:     number
  current?:   number
  plan:       PlanName
}

const TRIAL_DURATION_DAYS = 14

export const subscriptionService = {
  async getWorkspacePlan(workspaceId: string): Promise<PlanName> {
    const ws = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { plan: true },
    })
    return (ws?.plan ?? "STARTER") as PlanName
  },

  async getLimits(workspaceId: string) {
    const plan   = await this.getWorkspacePlan(workspaceId)
    const limits = PLAN_LIMITS[plan]
    return { plan, limits }
  },

  // ─── Individual checks ─────────────────────────────────────────────────────

  async canAddUser(workspaceId: string): Promise<LimitCheckResult> {
    const plan   = await this.getWorkspacePlan(workspaceId)
    const limits = PLAN_LIMITS[plan]

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
    const plan   = await this.getWorkspacePlan(workspaceId)
    const limits = PLAN_LIMITS[plan]

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
    const plan   = await this.getWorkspacePlan(workspaceId)
    const limits = PLAN_LIMITS[plan]

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
    const plan   = await this.getWorkspacePlan(workspaceId)
    const limits = PLAN_LIMITS[plan]
    const allowed = !!limits[feature]

    return {
      allowed,
      plan,
      reason: allowed ? undefined : `Feature "${String(feature)}" is not available on plan ${plan}. Upgrade to access it.`,
    }
  },

  // ─── Summary ─────────────────────────────────────────────────────────────────

  async getUsageSummary(workspaceId: string) {
    const plan   = await this.getWorkspacePlan(workspaceId)
    const limits = PLAN_LIMITS[plan]

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [userCount, proposalsThisMonth, projectCount, subscription] = await Promise.all([
      prisma.user.count({ where: { workspaceId } }),
      prisma.proposal.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } }),
      prisma.project.count({ where: { workspaceId } }),
      subscriptionRepository.findByWorkspace(workspaceId),
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
      subscription: subscription ? {
        status:      subscription.status,
        trialEndsAt: subscription.trialEndsAt,
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
      status:             "TRIALING",
      billingCycle:       "MONTHLY",
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
    return subscription.status === "TRIALING"
      && !!subscription.trialEndsAt
      && subscription.trialEndsAt.getTime() < Date.now()
  },

  /** Lazily checked on read (no scheduler exists yet in Phase 1). If a trial
   *  has lapsed without the workspace ever upgrading, it falls back to
   *  STARTER — STARTER is a usable ongoing tier, not a dead end, so this is
   *  a downgrade, not a lockout. */
  async expireTrialIfNeeded(workspaceId: string): Promise<Subscription | null> {
    const existing = await subscriptionRepository.findByWorkspace(workspaceId)
    if (!existing || !this.isTrialExpired(existing)) return existing

    const [, updated] = await prisma.$transaction([
      prisma.workspace.update({ where: { id: workspaceId }, data: { plan: "STARTER" } }),
      prisma.subscription.update({
        where: { workspaceId },
        data:  { plan: "STARTER", status: "ACTIVE" },
      }),
    ])

    return updated
  },
}
