import { prisma } from "@/lib/prisma"
import { PLAN_LIMITS, unlimited, type PlanName } from "@/config/plans"

export interface LimitCheckResult {
  allowed:    boolean
  reason?:    string
  limit?:     number
  current?:   number
  plan:       PlanName
}

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

    const [userCount, proposalsThisMonth] = await Promise.all([
      prisma.user.count({ where: { workspaceId } }),
      prisma.proposal.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } }),
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
      },
      features: {
        customBranding: limits.canCustomBranding,
        exportPdf:      limits.canExportPdf,
        apiAccess:      limits.canApiAccess,
      },
    }
  },
}
