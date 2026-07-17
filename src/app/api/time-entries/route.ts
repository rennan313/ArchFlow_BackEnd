import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission, requireWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { timeEntryService } from "@/modules/worklog/worklog.module"
import { createManualTimeEntrySchema, timeEntryQuerySchema } from "@/validations/timeEntry"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// ADR-022 — either permission gets past the door (VIEWER has neither); which
// one the caller actually holds decides the scope (own entries only, vs. any
// user's) via scopedUserId, resolved here at the route/border layer since
// services never import rbac.ts.
export const GET = requireAnyWorkspacePermission("create:time-entries", "view:time-entries")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const query = timeEntryQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    const result = await timeEntryService.list(workspaceId, query, scopedUserId)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:time-entries")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input = createManualTimeEntrySchema.parse(await req.json())
    const entry = await timeEntryService.createManual(workspaceId, user.sub, input)
    return created(entry, "Time entry created")
  } catch (error) { return handleServiceError(error) }
})
