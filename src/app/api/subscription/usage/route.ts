import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { subscriptionService } from "@/services/subscription.service"
import { ok, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const GET = withAuth(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    if (!user.workspaceId) return forbidden("No workspace")

    const summary = await subscriptionService.getUsageSummary(user.workspaceId)
    return ok(summary)
  } catch (error) {
    return handleServiceError(error)
  }
})
