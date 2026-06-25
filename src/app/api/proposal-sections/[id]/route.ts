import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalSectionService } from "@/services/proposal-section.service"
import { updateProposalSectionSchema } from "@/validations/proposal-section"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await proposalSectionService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:proposal-sections")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateProposalSectionSchema.parse(await req.json())
    return ok(await proposalSectionService.update(id, workspaceId, input), "Proposal section updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("delete:proposal-sections")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await proposalSectionService.delete(id, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
