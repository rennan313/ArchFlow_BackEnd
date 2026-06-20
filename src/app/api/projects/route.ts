import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { projectService } from "@/services/project.service"
import { createProjectSchema, projectQuerySchema } from "@/validations/project"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = projectQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await projectService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:projects")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input   = createProjectSchema.parse(await req.json())
    const project = await projectService.create(workspaceId, user.sub, input)
    return created(project, "Project created successfully")
  } catch (error) { return handleServiceError(error) }
})
