import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { workSessionService } from "@/modules/worklog/worklog.module"
import { switchActivitySchema } from "@/validations/workSession"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// "+ Nova Atividade" (ADR-024) — closes the open Step of the caller's active
// session and opens a new one with the given (fully optional, ADR-025)
// context. Does not touch the session's own clock. TIMER_NOT_ACTIVE if the
// session isn't RUNNING (e.g. PAUSED — resume() first).
export const POST = requireWorkspacePermission("update:time-entries")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const body  = await req.json().catch(() => ({}))
    const input = switchActivitySchema.parse(body)
    return ok(await workSessionService.switchContext(workspaceId, user.sub, input), "Activity switched")
  } catch (error) { return handleServiceError(error) }
})
