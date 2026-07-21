import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { workSessionService } from "@/modules/worklog/worklog.module"
import { startWorkSessionSchema } from "@/validations/workSession"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// TIMER_ALREADY_RUNNING (409) on the second concurrent call — ADR-024, the
// frontend uses this to show "you already have a session running, finish it
// and start a new one?" instead of a generic error.
export const POST = requireWorkspacePermission("create:time-entries")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    // Every field is optional (startWorkSessionSchema) — a bare "start" click
    // sends no body at all, which req.json() would otherwise throw a
    // SyntaxError on.
    const body    = await req.json().catch(() => ({}))
    const input   = startWorkSessionSchema.parse(body)
    const session = await workSessionService.start(workspaceId, user.sub, input)
    return created(session, "Work session started")
  } catch (error) { return handleServiceError(error) }
})
