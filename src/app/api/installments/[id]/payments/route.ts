import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { installmentService } from "@/modules/financial/financial.module"
import { registerPaymentSchema } from "@/validations/payment"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Registers a "baixa" against this installment — partial, total, or one of
// several payments for the same installment are all allowed
// (installmentService.registerPayment enforces the remaining-balance
// invariant). There is no PUT/DELETE here: payments are append-only.
export const POST = requireWorkspacePermission("create:financial-documents")(async (req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input   = registerPaymentSchema.parse(await req.json())
    const payment = await installmentService.registerPayment(id, workspaceId, user.sub, input)
    return created(payment, "Payment registered")
  } catch (error) { return handleServiceError(error) }
})
