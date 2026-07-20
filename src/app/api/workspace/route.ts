import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { workspaceService } from "@/services/workspace.service"
import { updateWorkspaceSettingsSchema } from "@/validations/workspace"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const GET = withWorkspace(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const workspace = await workspaceService.get(workspaceId)
    return ok(workspace)
  } catch (error) {
    return handleServiceError(error)
  }
})

// Worklog Sprint V2, MEL-01 — same tier as branding/dashboard-layout admin
// settings (update:workspace, ADMIN/OWNER). Today only sets Workspace.timezone;
// updateWorkspaceSettingsSchema is a bag so future workspace-level settings
// don't need a new route each time.
export const PATCH = requireWorkspacePermission("update:workspace")(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const input = updateWorkspaceSettingsSchema.parse(await req.json())
    const workspace = await workspaceService.updateSettings(workspaceId, input)
    return ok(workspace, "Workspace updated")
  } catch (error) {
    return handleServiceError(error)
  }
})
