import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { auditLog } from "@/lib/auditLog"
import { subscriptionService } from "@/services/subscription.service"
import type { Plan, BillingPlan, FeatureKey, PlanVersionStatus } from "@prisma/client"

// Entitlements Sprint (2026-07) — plan.service.ts is PURE and cacheable:
// "what does this workspace's plan allow", never "can this happen right
// now" (that's limit.service.ts, which calls this and never reads
// BillingPlan/EntitlementOverride directly — see CORE_MODULE_POLICY-style
// separation described in the sprint blueprint §2).
//
// BillingPlan is now the enforcement source of truth (versioned — see the
// schema comment on the model). config/plans.ts (PLAN_LIMITS/PLAN_PRICING)
// becomes seed input only (scripts/seed-billing-plan-versions-v1.ts), never
// a runtime read path for this service.

export interface Entitlements {
  planKey: Plan
  planVersion: number
  limits: {
    seats: number // -1 = unlimited, owner counts as one seat
    activeProjects: number // -1 = unlimited, archived projects excluded
    proposalsPerCycle: number // -1 = unlimited, counted on creation (drafts included), deletes don't free quota
    aiCreditsPerCycle: number // -1 = unlimited; PLAN-bucket grant per billing cycle
    storageBytes: bigint // -1n sentinel = unlimited
  }
  features: Set<FeatureKey>
}

// Overrides that target a numeric limit — key strings match exactly what
// EntitlementOverride.key stores (see the model comment in schema.prisma).
const NUMERIC_OVERRIDE_KEYS = {
  seats: "max_seats",
  activeProjects: "max_active_projects",
  proposalsPerCycle: "max_proposals_per_cycle",
  aiCreditsPerCycle: "ai_credits_per_cycle",
} as const

const STORAGE_OVERRIDE_KEY = "storage_limit_bytes"
const FEATURE_OVERRIDE_PREFIX = "feature:"

async function findActiveVersion(key: Plan): Promise<BillingPlan | null> {
  return prisma.billingPlan.findFirst({
    where: { key, status: "ACTIVE" as PlanVersionStatus },
    orderBy: { version: "desc" },
  })
}

function toEntitlements(plan: BillingPlan): Entitlements {
  return {
    planKey: plan.key,
    planVersion: plan.version,
    limits: {
      seats: plan.limitSeats,
      activeProjects: plan.limitActiveProjects,
      proposalsPerCycle: plan.limitProposalsPerCycle,
      aiCreditsPerCycle: plan.limitAiCreditsPerCycle,
      storageBytes: plan.limitStorageBytes,
    },
    features: new Set(plan.features),
  }
}

async function applyOverrides(workspaceId: string, entitlements: Entitlements): Promise<Entitlements> {
  const now = new Date()
  const overrides = await prisma.entitlementOverride.findMany({
    where: {
      workspaceId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  })
  if (overrides.length === 0) return entitlements

  const limits = { ...entitlements.limits }
  const features = new Set(entitlements.features)

  for (const o of overrides) {
    if (o.key === STORAGE_OVERRIDE_KEY && o.numericValue !== null) {
      limits.storageBytes = o.numericValue
      continue
    }
    if (o.numericValue !== null) {
      // seats/activeProjects/proposalsPerCycle/aiCreditsPerCycle are all
      // plain `number` limits (storageBytes, the one bigint field, is
      // handled above) — a switch keeps this type-safe without an unsound
      // cast through a dynamic key.
      const n = Number(o.numericValue)
      switch (o.key) {
        case NUMERIC_OVERRIDE_KEYS.seats:             limits.seats = n; continue
        case NUMERIC_OVERRIDE_KEYS.activeProjects:    limits.activeProjects = n; continue
        case NUMERIC_OVERRIDE_KEYS.proposalsPerCycle: limits.proposalsPerCycle = n; continue
        case NUMERIC_OVERRIDE_KEYS.aiCreditsPerCycle: limits.aiCreditsPerCycle = n; continue
      }
    }
    if (o.key.startsWith(FEATURE_OVERRIDE_PREFIX) && o.booleanValue !== null) {
      const featureKey = o.key.slice(FEATURE_OVERRIDE_PREFIX.length) as FeatureKey
      if (o.booleanValue) features.add(featureKey)
      else features.delete(featureKey)
    }
  }

  return { ...entitlements, limits, features }
}

export const planService = {
  // Resolves: Subscription.planVersionId → that exact BillingPlan row (never
  // the newest ACTIVE version for the plan key — that's what makes
  // grandfathering real) → merge EntitlementOverride. An active TRIAL
  // substitutes Professional-tier limits regardless of the workspace's
  // nominal plan (blueprint: "espelha o Professional para mostrar valor"),
  // same "everything unlocked during trial" spirit as the pre-Sprint
  // behavior, just pointed at Professional instead of Studio.
  async getEntitlements(workspaceId: string): Promise<Entitlements> {
    const sub = await subscriptionService.expireTrialIfNeeded(workspaceId)

    let plan: BillingPlan | null = null

    if (sub.status === "TRIAL") {
      plan = await findActiveVersion("PROFESSIONAL")
    } else if (sub.planVersionId) {
      plan = await prisma.billingPlan.findUnique({ where: { id: sub.planVersionId } })
    }

    // Fallback for a workspace not yet migrated to a planVersionId (pre-
    // Entitlements-Sprint data) — resolves to the current ACTIVE version for
    // its nominal plan. Once scripts/migrate-workspaces-to-plan-versions.ts
    // has run for every workspace, this branch should never be hit in
    // production; kept as a safety net, not the intended steady state.
    if (!plan) {
      plan = await findActiveVersion(sub.plan)
    }

    if (!plan) {
      auditLog({ event: "plan_version_not_found", level: "error", workspaceId, entity: "BillingPlan", planKey: sub.plan })
      throw new AppError(ErrorCode.BILLING_PLAN_VERSION_NOT_FOUND)
    }

    return applyOverrides(workspaceId, toEntitlements(plan))
  },

  async hasFeature(workspaceId: string, key: FeatureKey): Promise<boolean> {
    const { features } = await this.getEntitlements(workspaceId)
    return features.has(key)
  },

  // "Current sellable" row for new signups/upgrades — never what an
  // existing subscriber is grandfathered into (use getEntitlements for that).
  getActiveVersion(planKey: Plan): Promise<BillingPlan | null> {
    return findActiveVersion(planKey)
  },

  async getVersion(planVersionId: string): Promise<BillingPlan> {
    const plan = await prisma.billingPlan.findUnique({ where: { id: planVersionId } })
    if (!plan) throw new AppError(ErrorCode.BILLING_PLAN_VERSION_NOT_FOUND)
    return plan
  },

  // Publishes a new commercial version: deprecates the current ACTIVE row
  // for this key (if any) and inserts a new ACTIVE row — never an UPDATE to
  // a version that already has subscribers pointing at it via
  // Subscription.planVersionId (grandfathering, blueprint A7/DP8).
  async publishNewVersion(
    key: Plan,
    changes: Omit<Parameters<typeof prisma.billingPlan.create>[0]["data"], "key" | "version" | "status">,
  ): Promise<BillingPlan> {
    const current = await findActiveVersion(key)
    const nextVersion = (current?.version ?? 0) + 1

    const created = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.billingPlan.update({ where: { id: current.id }, data: { status: "DEPRECATED" } })
      }
      return tx.billingPlan.create({
        data: { ...changes, key, version: nextVersion, status: "ACTIVE" },
      })
    })

    auditLog({
      event: "billing_plan_version_published", entity: "BillingPlan", entityId: created.id,
      planKey: key, version: nextVersion, deprecatedVersion: current?.version ?? null,
    })
    return created
  },
}
