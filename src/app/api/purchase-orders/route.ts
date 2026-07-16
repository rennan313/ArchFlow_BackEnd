import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { purchaseOrderService } from "@/modules/purchasing/purchasing.module"
import { createPurchaseOrderSchema, purchaseOrderQuerySchema } from "@/validations/purchaseOrder"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = requireWorkspacePermission("view:purchase-orders")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = purchaseOrderQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await purchaseOrderService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:purchase-orders")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input = createPurchaseOrderSchema.parse(await req.json())
    const po    = await purchaseOrderService.create(workspaceId, user.sub, input)
    return created(po, "Purchase order created")
  } catch (error) { return handleServiceError(error) }
})
