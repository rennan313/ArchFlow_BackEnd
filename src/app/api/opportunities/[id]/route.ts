import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { opportunityService } from "@/services/opportunity.service"
import { updateOpportunitySchema } from "@/validations/opportunity"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    return ok(await opportunityService.getById(id, user.sub))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    const input  = updateOpportunitySchema.parse(await req.json())
    return ok(await opportunityService.update(id, user.sub, input), "Opportunity updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    await opportunityService.delete(id, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
