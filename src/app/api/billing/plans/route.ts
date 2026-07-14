import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withAuth } from "@/middlewares/auth"
import { billingPlanService } from "@/modules/billing/billing.module"
import type { JwtPayload } from "@/lib/jwt"

// GET — the persisted, sellable plan catalog (Story 4). Source for the
// authenticated plans page. Auth-only (any workspace member can view plans);
// the public marketing page uses its own static config.
export const GET = withAuth(
  async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload) => {
    try {
      return ok(await billingPlanService.listActive())
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
