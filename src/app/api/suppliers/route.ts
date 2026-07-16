import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { supplierService } from "@/modules/financial/financial.module"
import { createSupplierSchema, supplierQuerySchema } from "@/validations/supplier"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = supplierQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await supplierService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const input    = createSupplierSchema.parse(await req.json())
    const supplier = await supplierService.create(workspaceId, input)
    return created(supplier, "Supplier created")
  } catch (error) { return handleServiceError(error) }
})
