import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { statusService } from "@/services/status.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id }  = await ctx.params
    const history = await statusService.getHistory(id, workspaceId)
    return ok(history)
  } catch (error) {
    return handleServiceError(error)
  }
})
