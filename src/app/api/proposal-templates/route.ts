import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalTemplateService } from "@/services/proposal-template.service"
import { createProposalTemplateSchema, proposalTemplateQuerySchema } from "@/validations/proposal-template"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = proposalTemplateQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await proposalTemplateService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:proposal-templates")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input    = createProposalTemplateSchema.parse(await req.json())
    const template = await proposalTemplateService.create(workspaceId, user.sub, input)
    return created(template, "Proposal template created successfully")
  } catch (error) { return handleServiceError(error) }
})
