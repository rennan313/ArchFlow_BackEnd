import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params

    // Verify proposal belongs to this workspace
    await proposalService.getById(id, workspaceId)

    const media = await mediaService.list(id)
    return ok(media)
  } catch (error) {
    return handleServiceError(error)
  }
})
