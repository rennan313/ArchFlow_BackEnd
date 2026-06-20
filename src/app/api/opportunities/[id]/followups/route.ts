import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { followUpService } from "@/services/followup.service"
import { createFollowUpSchema } from "@/validations/followup"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await followUpService.listByOpportunity(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

// Follow-ups are operational sub-items of an Opportunity — gated the same as
// "Oportunidades — editar" rather than as their own resource.
export const POST = requireWorkspacePermission("update:opportunities")(async (req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = createFollowUpSchema.parse(await req.json())
    const fu     = await followUpService.create(id, workspaceId, user.sub, input)
    return created(fu, "Follow-up created")
  } catch (error) { return handleServiceError(error) }
})
