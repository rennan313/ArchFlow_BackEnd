import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { timeEntryService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// Badge count ("Atividades pendentes — 7") — same criterion as
// GET /api/time-entries/pending, no pagination.
export const GET = requireAnyWorkspacePermission("create:time-entries", "view:time-entries")(async (_req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    return ok({ count: await timeEntryService.countPending(workspaceId, scopedUserId) })
  } catch (error) { return handleServiceError(error) }
})
