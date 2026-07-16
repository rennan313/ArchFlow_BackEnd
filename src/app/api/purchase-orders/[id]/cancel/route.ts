import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { purchaseOrderService } from "@/modules/purchasing/purchasing.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Soft path — DRAFT only, preserves the record ("we quoted, decided not to
// proceed") instead of removing it. See DELETE on [id]/route.ts for the
// physical-delete alternative, also DRAFT-only (ADR-018).
export const POST = requireWorkspacePermission("delete:purchase-orders")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const po = await purchaseOrderService.cancel(id, workspaceId)
    return ok(po, "Purchase order cancelled")
  } catch (error) { return handleServiceError(error) }
})
