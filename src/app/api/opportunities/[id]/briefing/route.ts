import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { briefingService } from "@/services/briefing.service"
import { upsertBriefingSchema } from "@/validations/briefing"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    const briefing = await briefingService.get(id, user.sub)
    return ok(briefing)
  } catch (error) { return handleServiceError(error) }
})

export const PUT = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id }   = await ctx.params
    const input    = upsertBriefingSchema.parse(await req.json())
    const briefing = await briefingService.upsert(id, user.sub, input)
    return ok(briefing, "Briefing saved")
  } catch (error) { return handleServiceError(error) }
})
