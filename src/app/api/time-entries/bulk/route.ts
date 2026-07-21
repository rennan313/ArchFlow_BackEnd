import { type NextRequest } from "next/server"
import { requireWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { timeEntryService } from "@/modules/worklog/worklog.module"
import { bulkUpdateTimeEntriesSchema } from "@/validations/timeEntry"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// ADR-026 — batch association from the pending-activities / post-finish
// review screens ("associar projeto em lote"). update:time-entries, same
// tier as the single-entry PUT; scoped to the caller's own entries unless
// they hold view:time-entries (ADR-022).
export const PATCH = requireWorkspacePermission("update:time-entries")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { ids, ...input } = bulkUpdateTimeEntriesSchema.parse(await req.json())
    const scopedUserId = hasPermission(user.workspaceRole ?? "VIEWER", "view:time-entries") ? null : user.sub
    const result = await timeEntryService.bulkUpdate(ids, workspaceId, scopedUserId, input)
    return ok({ updated: result.count }, "Time entries updated")
  } catch (error) { return handleServiceError(error) }
})
