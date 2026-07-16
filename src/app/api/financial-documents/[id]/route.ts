import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { financialDocumentService } from "@/modules/financial/financial.module"
import { updateFinancialDocumentSchema } from "@/validations/financialDocument"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await financialDocumentService.getById(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("update:financial-documents")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateFinancialDocumentSchema.parse(await req.json())
    return ok(await financialDocumentService.update(id, workspaceId, input), "Financial document updated")
  } catch (error) { return handleServiceError(error) }
})

// Soft-cancels, never physically deletes; blocked once any payment exists —
// see financialDocumentService#cancel.
export const DELETE = requireWorkspacePermission("delete:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await financialDocumentService.cancel(id, workspaceId)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
