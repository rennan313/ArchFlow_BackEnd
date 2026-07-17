import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { bankAccountService } from "@/modules/financial/financial.module"
import { updateBankAccountSchema } from "@/validations/bankAccount"
import { ok, noContent } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Returns the account with its derived currentBalanceCents — see
// bankAccountService.getWithBalance. The plain list endpoint (GET /) does
// not compute this per-row to avoid an N-query fan-out on every list render.
export const GET = requireWorkspacePermission("view:financial-documents")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await bankAccountService.getWithBalance(id, workspaceId))
  } catch (error) { return handleServiceError(error) }
})

export const PUT = requireWorkspacePermission("manage:financial-settings")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = updateBankAccountSchema.parse(await req.json())
    return ok(await bankAccountService.update(id, workspaceId, input), "Bank account updated")
  } catch (error) { return handleServiceError(error) }
})

// Deactivates, never physically deletes — see bankAccountService#deactivate.
export const DELETE = requireWorkspacePermission("manage:financial-settings")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    await bankAccountService.deactivate(id, workspaceId, user.sub)
    return noContent()
  } catch (error) { return handleServiceError(error) }
})
