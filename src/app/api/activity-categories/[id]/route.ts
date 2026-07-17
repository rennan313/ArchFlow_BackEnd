import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { activityCategoryService } from "@/modules/worklog/worklog.module"
import { updateActivityCategorySchema } from "@/validations/activityCategory"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = requireWorkspacePermission("create:time-entries")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await activityCategoryService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("manage:worklog-settings")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateActivityCategorySchema.parse(await req.json())
    return ok(await activityCategoryService.update(id, workspaceId, input), "Activity category updated")
  } catch (error) { return handleServiceError(error) }
})

// Archives, never physically deletes (ADR-020).
export const DELETE = requireWorkspacePermission("manage:worklog-settings")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await activityCategoryService.archive(id, workspaceId, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
