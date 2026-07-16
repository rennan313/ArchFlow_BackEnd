import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { costCenterService } from "@/modules/financial/financial.module"
import { createCostCenterSchema, costCenterQuerySchema } from "@/validations/costCenter"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query = costCenterQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return ok(await costCenterService.list(workspaceId, query.includeArchived))
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const input      = createCostCenterSchema.parse(await req.json())
    const costCenter = await costCenterService.create(workspaceId, input)
    return created(costCenter, "Cost center created")
  } catch (error) { return handleServiceError(error) }
})
