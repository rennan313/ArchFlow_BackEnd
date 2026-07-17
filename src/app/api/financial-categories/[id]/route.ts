import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { financialCategoryService } from "@/modules/financial/financial.module"
import { updateFinancialCategorySchema } from "@/validations/financialCategory"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await financialCategoryService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateFinancialCategorySchema.parse(await req.json())
    return ok(await financialCategoryService.update(id, workspaceId, input), "Financial category updated")
  } catch (error) { return handleServiceError(error) }
})

// Archives, never physically deletes; blocked while active subcategories
// exist — see financialCategoryService#archive.
export const DELETE = requireWorkspacePermission("manage:financial-settings")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await financialCategoryService.archive(id, workspaceId, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
