import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { supplierCategoryService } from "@/modules/financial/financial.module"
import { createSupplierCategorySchema, supplierCategoryQuerySchema } from "@/validations/supplierCategory"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query = supplierCategoryQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return ok(await supplierCategoryService.list(workspaceId, query))
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const input    = createSupplierCategorySchema.parse(await req.json())
    const category = await supplierCategoryService.create(workspaceId, input)
    return created(category, "Supplier category created")
  } catch (error) { return handleServiceError(error) }
})
