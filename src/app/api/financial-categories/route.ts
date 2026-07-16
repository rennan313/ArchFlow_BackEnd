import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { financialCategoryService } from "@/modules/financial/financial.module"
import { createFinancialCategorySchema, financialCategoryQuerySchema } from "@/validations/financialCategory"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query = financialCategoryQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return ok(await financialCategoryService.list(workspaceId, query))
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const input    = createFinancialCategorySchema.parse(await req.json())
    const category = await financialCategoryService.create(workspaceId, input)
    return created(category, "Financial category created")
  } catch (error) { return handleServiceError(error) }
})
