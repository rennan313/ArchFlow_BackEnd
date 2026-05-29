import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { proposalVersionRepository } from "@/repositories/proposalVersion.repository"
import { proposalService } from "@/services/proposal.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    await proposalService.getById(id, user.sub) // verify ownership
    const versions = await proposalVersionRepository.findAll(id)
    return ok(versions)
  } catch (error) { return handleServiceError(error) }
})
