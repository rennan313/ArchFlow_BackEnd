import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalNarrativeService } from "@/services/proposal-narrative.service"
import { updateProposalNarrativeSchema } from "@/validations/proposal-narrative"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await proposalNarrativeService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:proposal-narratives")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateProposalNarrativeSchema.parse(await req.json())
    return ok(await proposalNarrativeService.update(id, workspaceId, input), "Proposal narrative updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("delete:proposal-narratives")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await proposalNarrativeService.delete(id, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
