import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { followUpService } from "@/services/followup.service"
import { createFollowUpSchema } from "@/validations/followup"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    return ok(await followUpService.listByOpportunity(id, user.sub))
  } catch (error) { return handleServiceError(error) }
})

export const POST = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    const input  = createFollowUpSchema.parse(await req.json())
    const fu     = await followUpService.create(id, user.sub, input)
    return created(fu, "Follow-up created")
  } catch (error) { return handleServiceError(error) }
})
