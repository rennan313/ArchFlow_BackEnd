import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { workSessionService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// No id in the path — always "my active session" (ADR-024), resolved
// server-side. TIMER_NOT_ACTIVE if there isn't one.
export const POST = requireWorkspacePermission("update:time-entries")(async (_req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    return ok(await workSessionService.pause(workspaceId, user.sub), "Work session paused")
  } catch (error) { return handleServiceError(error) }
})
