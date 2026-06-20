import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission, requirePermissionOrOwner } from "@/middlewares/rbac"
import { projectService } from "@/services/project.service"
import { updateProjectSchema } from "@/validations/project"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await projectService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

// DESIGNER doesn't have blanket update:projects — but may edit a project they
// created themselves (no "assigned project" field exists in the schema yet,
// so ownership via Project.userId is the agreed proxy).
export const PUT = requirePermissionOrOwner(
  "update:projects",
  ["DESIGNER"],
  async (_req, ctx, workspaceId) => {
    const { id } = await ctx.params
    const project = await projectService.getById(id, workspaceId).catch(() => null)
    return project?.userId ?? null
  },
)(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateProjectSchema.parse(await req.json())
    return ok(await projectService.update(id, workspaceId, input), "Project updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("delete:projects")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await projectService.delete(id, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
