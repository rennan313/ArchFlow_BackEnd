import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { timeEntryService } from "@/modules/worklog/worklog.module"
import { pendingQuerySchema } from "@/validations/timeEntry"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// ADR-026 — "Atividades Pendentes": closed entries missing projectId or
// categoryId, derived at read time. Same own-vs-view:time-entries scoping as
// GET /api/time-entries (ADR-022).
export const GET = requireAnyWorkspacePermission("create:time-entries", "view:time-entries")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { page, limit } = pendingQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    const result = await timeEntryService.listPending(workspaceId, scopedUserId, page, limit)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})
