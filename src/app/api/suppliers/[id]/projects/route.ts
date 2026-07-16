import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { supplierService } from "@/modules/financial/financial.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Distinct projects (id + name) this supplier has been billed against —
// derived from FinancialDocument, see supplier.repository.ts#findProjects.
export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await supplierService.projects(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})
