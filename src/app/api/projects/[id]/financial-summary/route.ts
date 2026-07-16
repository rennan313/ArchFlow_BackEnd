import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { projectFinancialSummaryService } from "@/modules/financial/financial.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Feeds the Financeiro tab on the Project detail page: receitas, despesas,
// saldo, margem direta and suppliers involved — see
// projectFinancialSummaryService for what each figure means (in particular,
// balanceCents is realized cash, directMarginCents is the contracted figure).
export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await projectFinancialSummaryService.getSummary(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})
