import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { addEmbedSchema } from "@/validations/media"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const POST = requireAnyWorkspacePermission("upload:media", "update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params

    await proposalService.getById(id, workspaceId)

    const body  = await req.json()
    const input = addEmbedSchema.parse(body)

    const media = await mediaService.addEmbed(id, workspaceId, input)
    return created(media, "Embed added successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
