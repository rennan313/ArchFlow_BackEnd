import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { worklogSummaryService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Feeds ProjectWorklogSection on the Project detail page: cards, charts and
// scope for the Timeline — see worklogSummary.service.ts for what each
// figure means. Same either-permission-gets-past-the-door shape as
// GET /api/time-entries — scopedUserId (ADR-022) narrows totals/byUser to
// the caller's own entries when they lack view:time-entries.
export const GET = requireAnyWorkspacePermission("create:time-entries", "view:time-entries")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    return ok(await worklogSummaryService.getProjectSummary(id, workspaceId, scopedUserId))
  } catch (error) { return handleServiceError(error) }
})
