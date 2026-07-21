import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { workSessionService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// The caller's own active (RUNNING/PAUSED) session + its open Step, or null —
// the reconciliation endpoint the frontend's Global Timer Widget polls
// (react-query refetchInterval) to catch a session started from another
// tab/device. Always self-scoped, no admin override in this phase
// (workSession.service.ts).
export const GET = requireWorkspacePermission("create:time-entries")(async (_req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    return ok(await workSessionService.getActive(workspaceId, user.sub))
  } catch (error) { return handleServiceError(error) }
})
