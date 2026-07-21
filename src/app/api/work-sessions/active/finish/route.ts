import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { workSessionService } from "@/modules/worklog/worklog.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// Ends the caller's active session (DP5: if PAUSED, endedAt is the last
// Step's own end, not this instant). Never blocks on duration — long
// sessions only surface a non-blocking flag (ADR-028). The frontend follows
// this with the review screen (GET /work-sessions/[id]), which is always
// dismissible via "Concluir depois" — see worklog-v3-adr.md §8.
export const POST = requireWorkspacePermission("update:time-entries")(async (_req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    return ok(await workSessionService.finish(workspaceId, user.sub), "Work session finished")
  } catch (error) { return handleServiceError(error) }
})
