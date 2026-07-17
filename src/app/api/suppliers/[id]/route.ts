import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { supplierService } from "@/modules/financial/financial.module"
import { updateSupplierSchema } from "@/validations/supplier"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await supplierService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:financial-documents")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateSupplierSchema.parse(await req.json())
    return ok(await supplierService.update(id, workspaceId, input), "Supplier updated")
  } catch (error) { return handleServiceError(error) }
})

// Archives, never physically deletes — see supplierService#delete.
export const DELETE = requireWorkspacePermission("delete:financial-documents")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await supplierService.delete(id, workspaceId, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
