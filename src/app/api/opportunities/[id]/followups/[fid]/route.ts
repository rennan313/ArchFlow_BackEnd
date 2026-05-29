import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { followUpService } from "@/services/followup.service"
import { updateFollowUpSchema } from "@/validations/followup"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string; fid: string }> }

export const PATCH = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { fid } = await ctx.params
    const input   = updateFollowUpSchema.parse(await req.json())
    return ok(await followUpService.update(fid, user.sub, input), "Follow-up updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { fid } = await ctx.params
    await followUpService.delete(fid, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
