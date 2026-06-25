import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalSectionInstanceService } from "@/services/proposal-section-instance.service"
import { reorderSectionInstancesSchema } from "@/validations/proposal-section-instance"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = requireWorkspacePermission("update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input = reorderSectionInstancesSchema.parse(await req.json())
    return ok(await proposalSectionInstanceService.reorder(id, workspaceId, input.order), "Reordered")
  } catch (error) { return handleServiceError(error) }
})
