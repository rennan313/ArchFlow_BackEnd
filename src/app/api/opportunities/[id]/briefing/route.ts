import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { briefingService } from "@/services/briefing.service"
import { upsertBriefingSchema } from "@/validations/briefing"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const briefing = await briefingService.get(id, workspaceId)
    return ok(briefing)
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("manage:briefings")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id }   = await ctx.params
    const input    = upsertBriefingSchema.parse(await req.json())
    const briefing = await briefingService.upsert(id, workspaceId, input)
    return ok(briefing, "Briefing saved")
  } catch (error) { return handleServiceError(error) }
})
