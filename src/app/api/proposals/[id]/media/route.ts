import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params

    // Verify proposal belongs to user
    await proposalService.getById(id, user.sub)

    const media = await mediaService.list(id)
    return ok(media)
  } catch (error) {
    return handleServiceError(error)
  }
})
