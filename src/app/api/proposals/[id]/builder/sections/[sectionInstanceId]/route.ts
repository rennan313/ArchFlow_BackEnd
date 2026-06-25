import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalSectionInstanceService } from "@/services/proposal-section-instance.service"
import { updateSectionInstanceSchema } from "@/validations/proposal-section-instance"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string; sectionInstanceId: string }> }

export const PATCH = requireWorkspacePermission("update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id, sectionInstanceId } = await ctx.params
    const input = updateSectionInstanceSchema.parse(await req.json())
    return ok(await proposalSectionInstanceService.updateSection(sectionInstanceId, id, workspaceId, input), "Section updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("update:proposals")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id, sectionInstanceId } = await ctx.params
    await proposalSectionInstanceService.removeSection(sectionInstanceId, id, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
