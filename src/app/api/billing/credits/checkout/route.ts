import type { NextRequest } from "next/server"
import { z } from "zod"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { requireWorkspaceRoleNoBillingGate } from "@/middlewares/rbac"
import { aiCreditPurchaseService } from "@/services/billing/aiCreditPurchase.service"
import { env } from "@/lib/env"
import type { JwtPayload } from "@/lib/jwt"

const creditCheckoutSchema = z.object({ packageId: z.string() })

// POST — create a one-off Mercado Pago checkout for an AI credit pack.
// OWNER-only, NoBillingGate so an OWNER can still buy credits from a
// read-only workspace state — FROZEN is checked explicitly inside the
// service (not the same thing as the generic canWrite gate this route
// bypasses). Body carries ONLY packageId — price/credits/currency/workspace
// are resolved server-side, never trusted from the client.
export const POST = requireWorkspaceRoleNoBillingGate("OWNER")(
  async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload, workspaceId: string) => {
    try {
      const { packageId } = creditCheckoutSchema.parse(await req.json())
      const result = await aiCreditPurchaseService.createCheckout({
        workspaceId,
        userId:  user.sub,
        packageId,
        backUrl: `${env.frontendUrl}/assinatura/creditos`,
      })
      return ok(result)
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
