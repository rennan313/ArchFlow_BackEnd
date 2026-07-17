import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { costCenterService } from "@/modules/financial/financial.module"
import { updateCostCenterSchema } from "@/validations/costCenter"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await costCenterService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateCostCenterSchema.parse(await req.json())
    return ok(await costCenterService.update(id, workspaceId, input), "Cost center updated")
  } catch (error) { return handleServiceError(error) }
})

export const DELETE = requireWorkspacePermission("manage:financial-settings")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await costCenterService.archive(id, workspaceId, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
