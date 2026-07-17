import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { supplierService } from "@/modules/financial/financial.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Same permission as DELETE — restoring is the inverse of the same
// destructive-tier action, not a new capability.
export const POST = requireWorkspacePermission("delete:financial-documents")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await supplierService.restore(id, workspaceId, user.sub), "Supplier restored")
  } catch (error) { return handleServiceError(error) }
})
