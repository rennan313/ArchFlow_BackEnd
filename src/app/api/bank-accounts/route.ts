import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { bankAccountService } from "@/modules/financial/financial.module"
import { createBankAccountSchema, bankAccountQuerySchema } from "@/validations/bankAccount"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = requireWorkspacePermission("view:financial-documents")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query = bankAccountQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return ok(await bankAccountService.list(workspaceId, query.includeInactive))
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const input   = createBankAccountSchema.parse(await req.json())
    const account = await bankAccountService.create(workspaceId, input)
    return created(account, "Bank account created")
  } catch (error) { return handleServiceError(error) }
})
