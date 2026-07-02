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

// PATCH — upgrade/reactivate the plan.
// Disabled until Mercado Pago webhook integration is complete.
// Enabling this without payment verification allows any OWNER to unlock
// paid plans for free. Re-enable when POST /api/webhooks/mercadopago
// is implemented and verified in production.
export const PATCH = requireWorkspaceRoleNoBillingGate("OWNER")(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, _workspaceId: string) => {
  return new Response(
    JSON.stringify({ success: false, message: "Payment integration not yet available. Contact support to upgrade your plan." }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  )
})
