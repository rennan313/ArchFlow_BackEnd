import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRoleNoBillingGate } from "@/middlewares/rbac"
import { billingSubscriptionService } from "@/modules/billing/billing.module"
import type { JwtPayload } from "@/lib/jwt"

// POST — cancel the subscription (stops gateway renewal, keeps access until the
// period ends). OWNER-only, NoBillingGate so it stays reachable even read-only.
export const POST = requireWorkspaceRoleNoBillingGate("OWNER")(
  async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
    try {
      return ok(await billingSubscriptionService.cancel(workspaceId))
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
