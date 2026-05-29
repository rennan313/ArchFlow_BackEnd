import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { subscriptionService } from "@/services/subscription.service"
import { inviteUserSchema } from "@/validations/workspace"
import { created, forbidden, badRequest } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"

export const POST = withRole("ADMIN", async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    if (!user.workspaceId) return forbidden("No workspace")

    // Check user seat limit before sending invite
    const limitCheck = await subscriptionService.canAddUser(user.workspaceId)
    if (!limitCheck.allowed) return forbidden(limitCheck.reason ?? "User limit reached")

    const body  = await req.json()
    const input = inviteUserSchema.parse(body)

    if (input.role === "OWNER" && user.workspaceRole !== "OWNER") {
      return badRequest("Only OWNER can invite another OWNER")
    }

    const invite = await workspaceService.invite(user.workspaceId, input.email, input.role)

    return created(
      {
        id:        invite.id,
        email:     invite.email,
        role:      invite.role,
        token:     process.env.NODE_ENV === "development" ? invite.token : undefined,
        expiresAt: invite.expiresAt,
        inviteUrl: `${process.env.FRONTEND_URL ?? "http://localhost:3001"}/accept-invite?token=${invite.token}`,
      },
      "Invite sent successfully",
    )
  } catch (error) {
    return handleServiceError(error)
  }
})
