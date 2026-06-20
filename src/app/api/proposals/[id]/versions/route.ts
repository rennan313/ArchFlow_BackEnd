import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { proposalVersionRepository } from "@/repositories/proposalVersion.repository"
import { proposalService } from "@/services/proposal.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await proposalService.getById(id, workspaceId) // verify workspace ownership
    const versions = await proposalVersionRepository.findAll(id)
    return ok(versions)
  } catch (error) { return handleServiceError(error) }
})
