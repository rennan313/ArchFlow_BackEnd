import { type NextRequest } from "next/server"
import { requireWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { timeEntryService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Same permission as DELETE — restoring is the inverse of the same
// destructive-tier action, not a new capability.
export const POST = requireWorkspacePermission("delete:time-entries")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    return ok(await timeEntryService.restore(id, workspaceId, user.sub, scopedUserId), "Time entry restored")
  } catch (error) { return handleServiceError(error) }
})
