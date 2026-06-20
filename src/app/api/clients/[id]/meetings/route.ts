import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { meetingService } from "@/services/meeting.service"
import { meetingQuerySchema } from "@/validations/meeting"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id }  = await ctx.params
    const query   = meetingQuerySchema.parse({
      ...Object.fromEntries(req.nextUrl.searchParams),
      clientId: id,
    })
    const result  = await meetingService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})
