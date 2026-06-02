import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { clientService } from "@/services/client.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    const proposals = await clientService.getProposals(id, user.sub)
    return ok(proposals)
  } catch (error) { return handleServiceError(error) }
})
