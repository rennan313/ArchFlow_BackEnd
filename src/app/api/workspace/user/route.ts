import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { removeUserSchema } from "@/validations/workspace"
import { noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"

export const DELETE = requireWorkspaceRole("ADMIN")(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const body  = await req.json()
    const input = removeUserSchema.parse(body)

    await workspaceService.removeUser(workspaceId, input.userId)
    return noContent()
  } catch (error) {
    return handleServiceError(error)
  }
})
