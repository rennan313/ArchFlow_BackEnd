import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { dashboardService } from "@/services/dashboard.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const GET = withAuth(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const data = await dashboardService.getAggregations(user.sub)
    return ok(data)
  } catch (error) { return handleServiceError(error) }
})
