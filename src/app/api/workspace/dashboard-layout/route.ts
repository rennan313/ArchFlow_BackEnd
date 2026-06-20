import { type NextRequest } from "next/server"
import { workspaceService } from "@/services/workspace.service"
import { updateDashboardLayoutSchema } from "@/validations/workspace"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withWorkspace } from "@/middlewares/auth"
import type { JwtPayload } from "@/lib/jwt"

// Dashboard widget order/visibility is a shared workspace preference, not a
// permission-gated admin action — any authenticated member may personalize
// the layout for the whole team, so this only needs withWorkspace.
export const PATCH = withWorkspace(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const body  = await req.json()
    const input = updateDashboardLayoutSchema.parse(body)

    const layout = await workspaceService.updateDashboardLayout(workspaceId, input)
    return ok(layout, "Dashboard layout updated")
  } catch (error) {
    return handleServiceError(error)
  }
})
