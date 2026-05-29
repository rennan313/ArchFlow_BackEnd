import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { removeUserSchema } from "@/validations/workspace"
import { noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"

export const DELETE = withRole("ADMIN", async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const body  = await req.json()
    const input = removeUserSchema.parse(body)

    if (!user.workspaceId) {
      const { forbidden } = await import("@/lib/response")
      return forbidden("No workspace")
    }

    await workspaceService.removeUser(user.workspaceId, input.userId)
    return noContent()
  } catch (error) {
    return handleServiceError(error)
  }
})
