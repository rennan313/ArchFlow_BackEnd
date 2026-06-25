import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalBlockService } from "@/services/proposal-block.service"
import { createProposalBlockSchema, proposalBlockQuerySchema } from "@/validations/proposal-block"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = proposalBlockQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await proposalBlockService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:proposal-blocks")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input = createProposalBlockSchema.parse(await req.json())
    const block = await proposalBlockService.create(workspaceId, user.sub, input)
    return created(block, "Proposal block created successfully")
  } catch (error) { return handleServiceError(error) }
})
