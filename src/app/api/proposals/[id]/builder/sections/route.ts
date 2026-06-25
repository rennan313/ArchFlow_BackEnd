import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalSectionInstanceService } from "@/services/proposal-section-instance.service"
import { addSectionInstanceSchema } from "@/validations/proposal-section-instance"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const POST = requireWorkspacePermission("update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = addSectionInstanceSchema.parse(await req.json())
    const section = await proposalSectionInstanceService.addSection(id, workspaceId, input)
    return created(section, "Section added")
  } catch (error) { return handleServiceError(error) }
})
