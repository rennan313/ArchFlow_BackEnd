import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { workspaceService } from "@/services/workspace.service"
import { ok, notFound } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const GET = withAuth(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    if (!user.workspaceId) return notFound("User has no workspace")
    const workspace = await workspaceService.get(user.workspaceId)
    return ok(workspace)
  } catch (error) {
    return handleServiceError(error)
  }
})
