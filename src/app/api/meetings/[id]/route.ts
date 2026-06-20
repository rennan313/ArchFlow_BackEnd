import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { meetingService } from "@/services/meeting.service"
import { updateMeetingSchema } from "@/validations/meeting"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await meetingService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:meetings")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id }  = await ctx.params
    const input   = updateMeetingSchema.parse(await req.json())
    const meeting = await meetingService.update(id, workspaceId, input)
    return ok(meeting, "Meeting updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("delete:meetings")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await meetingService.delete(id, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
