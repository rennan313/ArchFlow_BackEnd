import { type NextRequest } from "next/server"
import { PLAN_LIMITS, PLAN_LABELS, PLAN_PRICING } from "@/config/plans"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRoleNoBillingGate } from "@/middlewares/rbac"
import { withAuth } from "@/middlewares/auth"
import { subscriptionService } from "@/services/subscription.service"
import type { JwtPayload } from "@/lib/jwt"
import { z } from "zod"

// Only the two self-serve, sellable plans — STARTER isn't sold (it's the
// technical default a workspace reactivates into only via Mercado Pago
// support flows, never this button) and ENTERPRISE is contact-sales.
const upgradeSchema = z.object({
  plan:         z.enum(["PROFESSIONAL", "STUDIO"]),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).optional(),
})

// GET — list all plans with limits for comparison
export const GET = withAuth(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload) => {
  try {
    const plans = Object.entries(PLAN_LIMITS).map(([key, limits]) => ({
      id:      key,
      label:   PLAN_LABELS[key as keyof typeof PLAN_LABELS],
      pricing: PLAN_PRICING[key as keyof typeof PLAN_PRICING],
      limits: {
        users:             limits.maxUsers             === -1 ? "Unlimited" : limits.maxUsers,
        proposalsPerMonth: limits.maxProposalsPerMonth === -1 ? "Unlimited" : limits.maxProposalsPerMonth,
        storageMb:         limits.maxStorageMb         === -1 ? "Unlimited" : limits.maxStorageMb,
      },
      features: {
        customBranding: limits.canCustomBranding,
        exportPdf:      limits.canExportPdf,
        apiAccess:      limits.canApiAccess,
      },
    }))
    return ok(plans)
  } catch (error) {
    return handleServiceError(error)
  }
})

// PATCH — upgrade/reactivate the plan (OWNER only — billing stays
// OWNER-exclusive, not even ADMIN can change it). Exempt from the
// trial/subscription write-gate (requireWorkspaceRoleNoBillingGate, not
// requireWorkspaceRole) because this is the one write that must work even
// when the workspace is read-only — it's how the OWNER pays to unlock it.
export const PATCH = requireWorkspaceRoleNoBillingGate("OWNER")(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const body = await req.json()
    const { plan, billingCycle } = upgradeSchema.parse(body)

    const subscription = await subscriptionService.changePlan(workspaceId, plan, billingCycle)
    return ok(subscription, `Plan updated to ${PLAN_LABELS[plan]}`)
  } catch (error) {
    return handleServiceError(error)
  }
})
