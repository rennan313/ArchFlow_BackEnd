import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { purchaseOrderService } from "@/modules/purchasing/purchasing.module"
import { updatePurchaseOrderSchema } from "@/validations/purchaseOrder"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = requireWorkspacePermission("view:purchase-orders")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await purchaseOrderService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:purchase-orders")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updatePurchaseOrderSchema.parse(await req.json())
    return ok(await purchaseOrderService.update(id, workspaceId, input), "Purchase order updated")
  } catch (error) { return handleServiceError(error) }
})

// Physical delete — only reachable from DRAFT (ADR-018: a DRAFT purchase
// order never had a financial link, so there's no history to lose). Once
// APPROVED this always fails with PURCHASE_ORDER_NOT_DRAFT — use /cancel for
// the soft path, which is also DRAFT-only.
export const DELETE = requireWorkspacePermission("delete:purchase-orders")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await purchaseOrderService.remove(id, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
