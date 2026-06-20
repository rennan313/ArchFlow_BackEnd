import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { workspaceService } from "@/services/workspace.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const GET = withWorkspace(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const workspace = await workspaceService.get(workspaceId)
    return ok(workspace)
  } catch (error) {
    return handleServiceError(error)
  }
})
