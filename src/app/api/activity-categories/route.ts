import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { activityCategoryService } from "@/modules/worklog/worklog.module"
import { createActivityCategorySchema, activityCategoryQuerySchema } from "@/validations/activityCategory"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// Gated by create:time-entries, not manage:worklog-settings — every role
// that tracks time needs to read the category list to log an entry; only
// creating/editing/archiving categories is ADMIN/OWNER-tier (ADR-022).
export const GET = requireWorkspacePermission("create:time-entries")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query = activityCategoryQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return ok(await activityCategoryService.list(workspaceId, query))
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("manage:worklog-settings")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const input = createActivityCategorySchema.parse(await req.json())
    return created(await activityCategoryService.create(workspaceId, input), "Activity category created")
  } catch (error) { return handleServiceError(error) }
})
