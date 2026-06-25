import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalSectionService } from "@/services/proposal-section.service"
import { createProposalSectionSchema, proposalSectionQuerySchema } from "@/validations/proposal-section"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = proposalSectionQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await proposalSectionService.list(workspaceId, query)
    // Migration-only sections (Investimento, Riscos, etc.) are not valid
    // choices for the manual "Adicionar seção" picker on new proposals —
    // they exist solely for legacy-migration.service.ts to target.
    const data = result.data.filter((s) => !s.isMigrationOnly)
    return ok(data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:proposal-sections")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input   = createProposalSectionSchema.parse(await req.json())
    const section = await proposalSectionService.create(workspaceId, user.sub, input)
    return created(section, "Proposal section created successfully")
  } catch (error) { return handleServiceError(error) }
})
