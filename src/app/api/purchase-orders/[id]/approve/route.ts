import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { purchaseOrderService } from "@/modules/purchasing/purchasing.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// ADMIN-only (ADR-018) — Compras is the first module to actually gate a
// route with an approve permission (approve:financial-documents exists but
// is reserved/unwired). Idempotent replay on a duplicate request is handled
// inside purchaseOrderRepository#approve, not here — a second call for an
// already-approved order returns 200 with the same result, not an error.
export const POST = requireWorkspacePermission("approve:purchase-orders")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const result = await purchaseOrderService.approve(id, workspaceId, user.sub)
    return ok(result, "Purchase order approved")
  } catch (error) { return handleServiceError(error) }
})
