import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission, requireWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { timeEntryService } from "@/modules/worklog/worklog.module"
import { updateTimeEntrySchema } from "@/validations/timeEntry"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { AppError, ErrorCode } from "@/lib/errors"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Reads as NOT_FOUND rather than FORBIDDEN when a caller without
// view:time-entries requests someone else's entry — same "don't confirm the
// resource exists to a caller who shouldn't see it" reasoning the rest of
// the app already follows for cross-tenant references (CROSS_TENANT_REFERENCE).
export const GET = requireAnyWorkspacePermission("create:time-entries", "view:time-entries")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const entry = await timeEntryService.getById(id, workspaceId)
    const canViewOthers = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries")
    if (!canViewOthers && entry.userId !== user.sub) throw new AppError(ErrorCode.TIME_ENTRY_NOT_FOUND)
    return ok(entry)
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:time-entries")(async (req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateTimeEntrySchema.parse(await req.json())
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    return ok(await timeEntryService.update(id, workspaceId, scopedUserId, input), "Time entry updated")
  } catch (error) { return handleServiceError(error) }
})

// Archives, never physically deletes (ADR-020). Blocked while the entry is
// RUNNING/PAUSED — stop the timer first (timeEntryService.archive's guard).
export const DELETE = requireWorkspacePermission("delete:time-entries")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    await timeEntryService.archive(id, workspaceId, user.sub, scopedUserId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
