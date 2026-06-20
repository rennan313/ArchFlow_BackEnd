import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { followUpService } from "@/services/followup.service"
import { updateFollowUpSchema } from "@/validations/followup"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string; fid: string }> }

export const PATCH = requireWorkspacePermission("update:opportunities")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { fid } = await ctx.params
    const input   = updateFollowUpSchema.parse(await req.json())
    return ok(await followUpService.update(fid, workspaceId, input), "Follow-up updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("update:opportunities")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { fid } = await ctx.params
    await followUpService.delete(fid, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
