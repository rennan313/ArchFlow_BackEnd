import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { projectService } from "@/services/project.service"
import { limitService } from "@/services/billing/limit.service"
import { createProjectSchema, projectQuerySchema } from "@/validations/project"
import { ok, created, forbidden } from "@/lib/response"
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
    // Entitlements Sprint Phase 3 — active-project limit never had ANY
    // enforcement before (audited: maxProjects existed in PLAN_LIMITS,
    // displayed in usage summaries, never checked anywhere). Shadow-mode by
    // default — net-new gate, cannot regress existing behavior. Does NOT
    // cover the AI-generated-proposal flow's implicit project creation
    // (ai/generate-proposal/route.ts) — deferred alongside AI credits,
    // which that same route needs wired in the same pass.
    const limitCheck = await limitService.canCreateProject(workspaceId)
    if (!limitCheck.allowed) return forbidden(limitCheck.reason ?? "Active project limit reached")

    const input   = createProjectSchema.parse(await req.json())
    const project = await projectService.create(workspaceId, user.sub, input)
    return created(project, "Project created successfully")
  } catch (error) { return handleServiceError(error) }
})
