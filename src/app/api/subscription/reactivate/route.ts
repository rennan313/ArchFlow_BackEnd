import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRoleNoBillingGate } from "@/middlewares/rbac"
import { billingSubscriptionService } from "@/modules/billing/billing.module"
import type { JwtPayload } from "@/lib/jwt"

// POST — undo a pending cancellation. OWNER-only, NoBillingGate.
export const POST = requireWorkspaceRoleNoBillingGate("OWNER")(
  async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
    try {
      return ok(await billingSubscriptionService.reactivate(workspaceId))
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
