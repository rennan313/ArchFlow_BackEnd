import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { opportunityService } from "@/services/opportunity.service"
import { updateOpportunitySchema } from "@/validations/opportunity"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await opportunityService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:opportunities")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateOpportunitySchema.parse(await req.json())
    return ok(await opportunityService.update(id, workspaceId, input), "Opportunity updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("delete:opportunities")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await opportunityService.delete(id, workspaceId, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
