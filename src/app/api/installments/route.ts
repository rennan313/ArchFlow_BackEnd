import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { installmentService } from "@/modules/financial/financial.module"
import { installmentQuerySchema } from "@/validations/installment"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// Flat parcela-level list — this is both the "Financeiro" screen and the
// "Relatórios" screen (identical filter set: período, projeto, fornecedor,
// cliente, categoria, status), see installment.ts validation comment.
export const GET = requireWorkspacePermission("view:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = installmentQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await installmentService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})
