import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireProposalLimit } from "@/middlewares/limits"
import { hasPermission } from "@/middlewares/rbac"
import { proposalService } from "@/services/proposal.service"
import { createProposalSchema, proposalQuerySchema } from "@/validations/proposal"
import { ok, created, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query = proposalQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const { data, pagination } = await proposalService.list(workspaceId, query)
    return ok(data, undefined, pagination)
  } catch (error) {
    return handleServiceError(error)
  }
})

// requireProposalLimit wraps withAuth (not withWorkspace), since it needs to
// run its own plan-limit check first — so the workspace guard and the RBAC
// permission check are both inline here instead of composed middleware.
export const POST = requireProposalLimit(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    if (!user.workspaceId) return forbidden("This action requires a workspace. Complete onboarding first.")
    if (!hasPermission(user.workspaceRole ?? "VIEWER", "create:proposals")) {
      return forbidden("Permission denied: create:proposals")
    }
    const body     = await req.json()
    const input    = createProposalSchema.parse(body)
    const proposal = await proposalService.create(user.workspaceId, user.sub, input)
    return created(proposal, "Proposal created successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
