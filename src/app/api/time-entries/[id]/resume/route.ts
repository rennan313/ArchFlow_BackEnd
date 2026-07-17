import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { timerService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const POST = requireWorkspacePermission("update:time-entries")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await timerService.resume(id, workspaceId, user.sub), "Timer resumed")
  } catch (error) { return handleServiceError(error) }
})
