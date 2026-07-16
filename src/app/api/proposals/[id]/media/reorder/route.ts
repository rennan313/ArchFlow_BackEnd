import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { reorderMediaSchema } from "@/validations/media"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const PUT = requireAnyWorkspacePermission("upload:media", "update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params

    await proposalService.getById(id, workspaceId)

    const body  = await req.json()
    const input = reorderMediaSchema.parse(body)

    const media = await mediaService.reorder(id, workspaceId, input)
    return ok(media, "Media reordered successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
