import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { opportunityService } from "@/services/opportunity.service"
import { createOpportunitySchema, opportunityQuerySchema } from "@/validations/opportunity"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const query  = opportunityQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await opportunityService.list(user.sub, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const input = createOpportunitySchema.parse(await req.json())
    const opp   = await opportunityService.create(user.sub, input)
    return created(opp, "Opportunity created")
  } catch (error) { return handleServiceError(error) }
})
