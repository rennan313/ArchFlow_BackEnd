import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { subscriptionService } from "@/services/subscription.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const GET = withWorkspace(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const summary = await subscriptionService.getUsageSummary(workspaceId)
    return ok(summary)
  } catch (error) {
    return handleServiceError(error)
  }
})
