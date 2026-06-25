import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalNarrativeService } from "@/services/proposal-narrative.service"
import { createProposalNarrativeSchema, proposalNarrativeQuerySchema } from "@/validations/proposal-narrative"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = proposalNarrativeQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await proposalNarrativeService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:proposal-narratives")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input     = createProposalNarrativeSchema.parse(await req.json())
    const narrative = await proposalNarrativeService.create(workspaceId, user.sub, input)
    return created(narrative, "Proposal narrative created successfully")
  } catch (error) { return handleServiceError(error) }
})
