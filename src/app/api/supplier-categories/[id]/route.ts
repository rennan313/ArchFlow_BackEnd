import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { supplierCategoryService } from "@/modules/financial/financial.module"
import { updateSupplierCategorySchema } from "@/validations/supplierCategory"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await supplierCategoryService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateSupplierCategorySchema.parse(await req.json())
    return ok(await supplierCategoryService.update(id, workspaceId, input), "Supplier category updated")
  } catch (error) { return handleServiceError(error) }
})

// Archives, never physically deletes — see supplierCategory.service.ts#archive.
export const DELETE = requireWorkspacePermission("manage:financial-settings")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await supplierCategoryService.archive(id, workspaceId, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
