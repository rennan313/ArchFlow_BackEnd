import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRoleNoBillingGate } from "@/middlewares/rbac"
import { billingCheckoutService, checkoutSchema } from "@/modules/billing/billing.module"
import { env } from "@/lib/env"
import type { JwtPayload } from "@/lib/jwt"

// POST — create a Mercado Pago checkout for the chosen plan/cycle. OWNER-only,
// and NoBillingGate so an OWNER on a read-only (expired/past-due) workspace can
// still pay to unlock it. Returns { initPoint } for the frontend to redirect to.
export const POST = requireWorkspaceRoleNoBillingGate("OWNER")(
  async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
    try {
      const { plan, cycle } = checkoutSchema.parse(await req.json())
      const result = await billingCheckoutService.createCheckout({
        workspaceId,
        planKey: plan,
        cycle,
        backUrl: `${env.frontendUrl}/settings/subscription`,
      })
      return ok(result)
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
