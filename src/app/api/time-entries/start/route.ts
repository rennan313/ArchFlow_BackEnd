import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { timerService } from "@/modules/worklog/worklog.module"
import { startTimerSchema } from "@/validations/timeEntry"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// TIMER_ALREADY_RUNNING (409) on the second concurrent call — ADR-021, the
// frontend uses this to show "you already have a timer running, finish it
// and start a new one?" instead of a generic error.
export const POST = requireWorkspacePermission("create:time-entries")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    // Every field is optional (startTimerSchema) — a bare "start" click sends
    // no body at all, which req.json() would otherwise throw a SyntaxError on.
    const body  = await req.json().catch(() => ({}))
    const input = startTimerSchema.parse(body)
    const entry = await timerService.start(workspaceId, user.sub, input)
    return created(entry, "Timer started")
  } catch (error) { return handleServiceError(error) }
})
