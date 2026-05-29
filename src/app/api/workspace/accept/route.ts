import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { workspaceService } from "@/services/workspace.service"
import { acceptInviteSchema } from "@/validations/workspace"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

const INVITE_ERRORS: Record<string, string> = {
  INVITE_NOT_FOUND:    "Invite not found or invalid",
  INVITE_ALREADY_USED: "This invite has already been accepted",
  INVITE_EXPIRED:      "This invite has expired",
}

export const POST = withAuth(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const body        = await req.json()
    const { token }   = acceptInviteSchema.parse(body)
    const workspaceId = await workspaceService.acceptInvite(token, user.sub)
    return ok({ workspaceId }, "Welcome to the workspace!")
  } catch (error) {
    if (error instanceof Error && INVITE_ERRORS[error.message]) {
      const { badRequest } = await import("@/lib/response")
      return badRequest(INVITE_ERRORS[error.message])
    }
    return handleServiceError(error)
  }
})
