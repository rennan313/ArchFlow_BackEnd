import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { limitService } from "@/services/billing/limit.service"
import { inviteUserSchema } from "@/validations/workspace"
import { created, forbidden, badRequest } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"
import { env } from "@/lib/env"

export const POST = requireWorkspaceRole("ADMIN")(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload, workspaceId: string) => {
  try {
    // Entitlements Sprint "close the debts" (2026-07) — swapped from
    // subscriptionService.canAddUser (read the stale config/plans.ts
    // numbers — Starter capped at 1 seat even after the public pricing page
    // started selling 4) to limitService.canAddSeat (reads the live
    // BillingPlan). Always enforced for real, no shadow-mode — see the
    // comment on limit.service.ts's withShadowMode.
    const limitCheck = await limitService.canAddSeat(workspaceId)
    if (!limitCheck.allowed) return forbidden(limitCheck.reason ?? "User limit reached")

    const body  = await req.json()
    const input = inviteUserSchema.parse(body)

    if (input.role === "OWNER" && user.workspaceRole !== "OWNER") {
      return badRequest("Only OWNER can invite another OWNER")
    }

    const invite = await workspaceService.invite(workspaceId, input.email, input.role)

    return created(
      {
        id:        invite.id,
        email:     invite.email,
        role:      invite.role,
        token:     env.isDev ? invite.token : undefined,
        expiresAt: invite.expiresAt,
        inviteUrl: `${env.frontendUrl}/accept-invite?token=${invite.token}`,
      },
      "Invite sent successfully",
    )
  } catch (error) {
    return handleServiceError(error)
  }
})
