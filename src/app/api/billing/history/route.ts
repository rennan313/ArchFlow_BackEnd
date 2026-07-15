import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withWorkspace } from "@/middlewares/auth"
import { billingService } from "@/services/billing.service"
import type { JwtPayload } from "@/lib/jwt"

// GET — the workspace's payment history (Story 10). Read-only, so withWorkspace
// (any member can view). Returns BillingHistory rows newest-first.
export const GET = withWorkspace(
  async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
    try {
      return ok(await billingService.getHistory(workspaceId))
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
