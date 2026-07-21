import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { workSessionService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Session + its Steps, in chronological order — feeds the post-finish()
// review screen (worklog-v3-adr.md §8). Same own-vs-view:time-entries
// scoping as GET /api/time-entries/[id] (ADR-022).
export const GET = requireAnyWorkspacePermission("create:time-entries", "view:time-entries")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    return ok(await workSessionService.getById(id, workspaceId, scopedUserId))
  } catch (error) { return handleServiceError(error) }
})
