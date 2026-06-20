import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { opportunityService } from "@/services/opportunity.service"
import { createOpportunitySchema, opportunityQuerySchema } from "@/validations/opportunity"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = opportunityQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await opportunityService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:opportunities")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input = createOpportunitySchema.parse(await req.json())
    const opp   = await opportunityService.create(workspaceId, user.sub, input)
    return created(opp, "Opportunity created")
  } catch (error) { return handleServiceError(error) }
})
