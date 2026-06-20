import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { updateUserRoleSchema } from "@/validations/workspace"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"

export const PATCH = requireWorkspaceRole("ADMIN")(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const body  = await req.json()
    const input = updateUserRoleSchema.parse(body)

    const updated = await workspaceService.updateUserRole(workspaceId, input.userId, input.role)
    return ok({ id: updated.id, workspaceRole: updated.workspaceRole }, "Role updated")
  } catch (error) {
    return handleServiceError(error)
  }
})
