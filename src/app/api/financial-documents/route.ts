import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { financialDocumentService } from "@/modules/financial/financial.module"
import { createFinancialDocumentSchema, financialDocumentQuerySchema } from "@/validations/financialDocument"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = financialDocumentQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await financialDocumentService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:financial-documents")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input = createFinancialDocumentSchema.parse(await req.json())
    const doc   = await financialDocumentService.create(workspaceId, user.sub, input)
    return created(doc, "Financial document created")
  } catch (error) { return handleServiceError(error) }
})
