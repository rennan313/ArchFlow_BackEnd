import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { auditLog } from "@/lib/auditLog"
import { planService } from "./plan.service"
import { aiCreditService } from "./aiCredit.service"
import { storageUsageService } from "./storageUsage.service"
import { subscriptionService } from "@/services/subscription.service"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import type { FeatureKey } from "@prisma/client"

// Entitlements Sprint (2026-07) — limit.service.ts is usage-aware ("can this
// happen right now"). Every method below calls planService.getEntitlements()
// — never reads BillingPlan/EntitlementOverride directly (blueprint §2 rule
// #2: PlanService is pure/cacheable, LimitService is usage-aware, the two
// are never merged).
//
// These are cheap PRE-FLIGHT checks (fast 403 for good UX) — they are NOT
// by themselves race-safe under concurrency. The authoritative, race-safe
// guard lives in the actual creation transaction (a CAS updateMany or a
// post-create re-count-and-rollback), mirroring purchaseOrder.repository.ts.
// canUploadFile in particular only reads the running counter; the real
// reservation happens via storageUsageService.reserveAndIncrement inside the
// upload's own transaction.

export interface LimitCheckResult {
  allowed: boolean
  reason?: string
  limit?: number
  current?: number
}

function limitReachedResult(current: number, limit: number, label: string): LimitCheckResult {
  return {
    allowed: false, current, limit,
    reason: `Plan allows ${limit} ${label}. You have ${current}. Upgrade to add more.`,
  }
}

// Shadow-mode gate — wraps every method that can return allowed:false. If
// enforcement is disabled (globally or for this workspace), the real result
// is still computed and logged, but the caller always sees allowed:true.
async function withShadowMode(workspaceId: string, result: LimitCheckResult, event: string): Promise<LimitCheckResult> {
  if (result.allowed) return result

  const sub = await subscriptionRepository.findByWorkspace(workspaceId)
  const enforced = sub?.billingEnforcementOverride ?? env.billingEnforcementDefault
  if (enforced) return result

  auditLog({ event: "limit_shadow_block", level: "warn", workspaceId, entity: "Entitlement", checkEvent: event, reason: result.reason, current: result.current, limit: result.limit })
  return { allowed: true }
}

export const limitService = {
  // Owner-inclusive, pending-invite-exclusive — matches the confirmed
  // semantics: only accepted WorkspaceInvite rows (i.e. real User rows)
  // occupy a seat. Same counting as the pre-Sprint canAddUser.
  async canAddSeat(workspaceId: string): Promise<LimitCheckResult> {
    const { limits } = await planService.getEntitlements(workspaceId)
    if (limits.seats === -1) return { allowed: true }

    const current = await prisma.user.count({ where: { workspaceId } })
    const result = current >= limits.seats
      ? limitReachedResult(current, limits.seats, "seat(s)")
      : { allowed: true, current, limit: limits.seats }
    return withShadowMode(workspaceId, result, "seat_limit")
  },

  // Counts ACTIVE (non-archived) projects only — archiving a project frees a
  // slot for a new one (blueprint §6.2, confirmed UX/upgrade-lever behavior).
  async canCreateProject(workspaceId: string): Promise<LimitCheckResult> {
    const { limits } = await planService.getEntitlements(workspaceId)
    if (limits.activeProjects === -1) return { allowed: true }

    const current = await prisma.project.count({ where: { workspaceId, archived: false } })
    const result = current >= limits.activeProjects
      ? limitReachedResult(current, limits.activeProjects, "active project(s)")
      : { allowed: true, current, limit: limits.activeProjects }
    return withShadowMode(workspaceId, result, "project_limit")
  },

  // Counts proposals CREATED since the current billing cycle started
  // (Subscription.currentPeriodStart — never calendar-month), INCLUDING
  // archived ones: deleting/archiving a proposal never frees quota
  // (blueprint §6.2/DP6, anti-abuse). `archived: undefined` is deliberate —
  // it satisfies the `"archived" in where` check in src/lib/prisma.ts's
  // auto-filter extension (so the extension does NOT inject `archived:
  // false`), while Prisma itself drops the undefined key before querying
  // Mongo, so no archived filter is applied at all.
  async canCreateProposal(workspaceId: string): Promise<LimitCheckResult> {
    const [{ limits }, sub] = await Promise.all([
      planService.getEntitlements(workspaceId),
      subscriptionRepository.findByWorkspace(workspaceId),
    ])
    if (limits.proposalsPerCycle === -1) return { allowed: true }

    const cycleStart = sub?.currentPeriodStart ?? startOfCalendarMonth()
    const current = await prisma.proposal.count({
      where: { workspaceId, createdAt: { gte: cycleStart }, archived: undefined },
    })
    const result = current >= limits.proposalsPerCycle
      ? limitReachedResult(current, limits.proposalsPerCycle, "proposal(s) this cycle")
      : { allowed: true, current, limit: limits.proposalsPerCycle }
    return withShadowMode(workspaceId, result, "proposal_limit")
  },

  // Pre-flight only — reads the running WorkspaceUsage counter, does not
  // reserve. The real, race-safe reservation happens inside the upload's own
  // transaction via storageUsageService.reserveAndIncrement.
  async canUploadFile(workspaceId: string, fileSizeBytes: number): Promise<LimitCheckResult> {
    const { limits } = await planService.getEntitlements(workspaceId)
    if (limits.storageBytes === -1n) return { allowed: true }

    const current = await storageUsageService.getUsedBytes(workspaceId)
    const projected = current + BigInt(fileSizeBytes)
    const result = projected > limits.storageBytes
      ? { allowed: false, current: Number(current), limit: Number(limits.storageBytes), reason: `Storage limit of ${limits.storageBytes} bytes reached. Upgrade to upload more files.` }
      : { allowed: true, current: Number(current), limit: Number(limits.storageBytes) }
    return withShadowMode(workspaceId, result, "storage_limit")
  },

  async canUseFeature(workspaceId: string, key: FeatureKey): Promise<LimitCheckResult> {
    const allowed = await planService.hasFeature(workspaceId, key)
    const result: LimitCheckResult = allowed
      ? { allowed: true }
      : { allowed: false, reason: `Feature "${key}" is not available on your current plan. Upgrade to access it.` }
    return withShadowMode(workspaceId, result, "feature_gate")
  },

  // Delegates the real balance/cost check to aiCreditService — never reads
  // AiCreditBalance directly (single source of truth for "how much AI is
  // left" stays in aiCredit.service.ts).
  async canSpendAiCredits(workspaceId: string, operation: Parameters<typeof aiCreditService.getCostForOperation>[0]): Promise<LimitCheckResult> {
    const cost = aiCreditService.getCostForOperation(operation)
    const { plan, purchased } = await aiCreditService.getBalance(workspaceId)
    const total = plan + purchased
    const result = total < cost
      ? { allowed: false, current: total, limit: cost, reason: `AI credits exhausted (need ${cost}, have ${total}). Buy more credits or upgrade your plan.` }
      : { allowed: true, current: total, limit: cost }
    return withShadowMode(workspaceId, result, "ai_credit_limit")
  },

  // Feeds the settings/billing page — a superset of the old
  // subscriptionService.getUsageSummary shape (same `plan`/`subscription.*`
  // fields BillingClient.tsx already reads — status, cancelAtPeriodEnd,
  // daysLeft, currentPeriodEnd, billingCycle, isReadOnly — so swapping the
  // route to this method is a pure read-side upgrade, not a breaking
  // change), PLUS the new per-limit usage (seats/activeProjects/
  // proposalsThisCycle/aiCredits/storage) the 5-bar widget needs. `features`
  // changes shape (FeatureKey[] instead of the old 3-boolean object) — safe,
  // nothing in the frontend reads the old `features` field today.
  async getUsageSummary(workspaceId: string) {
    const [{ limits, planKey, features }, sub] = await Promise.all([
      planService.getEntitlements(workspaceId),
      subscriptionRepository.findByWorkspace(workspaceId),
    ])
    const cycleStart = sub?.currentPeriodStart ?? startOfCalendarMonth()

    const [seatCount, projectCount, proposalCount, aiBalance, storageUsed] = await Promise.all([
      prisma.user.count({ where: { workspaceId } }),
      prisma.project.count({ where: { workspaceId, archived: false } }),
      prisma.proposal.count({ where: { workspaceId, createdAt: { gte: cycleStart }, archived: undefined } }),
      aiCreditService.getBalance(workspaceId),
      storageUsageService.getUsedBytes(workspaceId),
    ])

    return {
      plan: planKey,
      usage: {
        seats: { current: seatCount, limit: limits.seats, unlimited: limits.seats === -1 },
        activeProjects: { current: projectCount, limit: limits.activeProjects, unlimited: limits.activeProjects === -1 },
        proposalsThisCycle: { current: proposalCount, limit: limits.proposalsPerCycle, unlimited: limits.proposalsPerCycle === -1 },
        aiCredits: { current: aiBalance.plan + aiBalance.purchased, plan: aiBalance.plan, purchased: aiBalance.purchased, limit: limits.aiCreditsPerCycle, unlimited: limits.aiCreditsPerCycle === -1 },
        storage: { currentBytes: storageUsed.toString(), limitBytes: limits.storageBytes.toString(), unlimited: limits.storageBytes === -1n },
      },
      features: Array.from(features),
      subscription: sub ? {
        status:            sub.status,
        accessLevel:       subscriptionService.getAccessLevel(sub),
        billingCycle:      sub.billingCycle,
        trialStartedAt:    sub.trialStartedAt,
        trialEndsAt:       sub.trialEndsAt,
        currentPeriodEnd:  sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        daysLeft:          subscriptionService.daysLeftInTrial(sub),
        isReadOnly:        !(sub.status === "ACTIVE" || sub.status === "TRIAL"),
      } : null,
    }
  },
}

function startOfCalendarMonth(): Date {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}
