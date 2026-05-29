import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { updateUserRoleSchema } from "@/validations/workspace"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"

export const PATCH = withRole("ADMIN", async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const body  = await req.json()
    const input = updateUserRoleSchema.parse(body)

    if (!user.workspaceId) {
      const { forbidden } = await import("@/lib/response")
      return forbidden("No workspace")
    }

    const updated = await workspaceService.updateUserRole(user.workspaceId, input.userId, input.role)
    return ok({ id: updated.id, workspaceRole: updated.workspaceRole }, "Role updated")
  } catch (error) {
    return handleServiceError(error)
  }
})
