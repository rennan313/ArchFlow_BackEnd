import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { addEmbedSchema } from "@/validations/media"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params

    await proposalService.getById(id, user.sub)

    const body  = await req.json()
    const input = addEmbedSchema.parse(body)

    const media = await mediaService.addEmbed(id, input)
    return created(media, "Embed added successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
