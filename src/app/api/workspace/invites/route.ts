import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { cancelInviteSchema } from "@/validations/workspace"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"

export const GET = requireWorkspaceRole("ADMIN")(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const invites = await workspaceService.listPendingInvites(workspaceId)
    return ok(invites)
  } catch (error) {
    return handleServiceError(error)
  }
})

export const DELETE = requireWorkspaceRole("ADMIN")(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const body  = await req.json()
    const input = cancelInviteSchema.parse(body)

    await workspaceService.cancelInvite(workspaceId, input.inviteId)
    return noContent()
  } catch (error) {
    return handleServiceError(error)
  }
})
