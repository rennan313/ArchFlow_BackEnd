import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { updateMediaSchema } from "@/validations/media"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string; mediaId: string }> }

export const PATCH = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id, mediaId } = await ctx.params

    await proposalService.getById(id, user.sub)

    const body  = await req.json()
    const input = updateMediaSchema.parse(body)

    const media = await mediaService.update(mediaId, id, input)
    return ok(media, "Media updated successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id, mediaId } = await ctx.params

    await proposalService.getById(id, user.sub)
    await mediaService.delete(mediaId, id)

    return noContent()
  } catch (error) {
    return handleServiceError(error)
  }
})
