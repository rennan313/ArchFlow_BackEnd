import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withAuth } from "@/middlewares/auth"
import { aiCreditPurchaseService } from "@/services/billing/aiCreditPurchase.service"
import type { JwtPayload } from "@/lib/jwt"

// GET — the sellable AI credit packs (id/credits/price/currency), sourced
// exclusively from config/aiCreditPackages.ts. Auth-only (any workspace
// member can see the packages) — the frontend only ever echoes a packageId
// back to POST /checkout, never a price or credit amount.
export const GET = withAuth(
  async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload) => {
    try {
      return ok(aiCreditPurchaseService.listPackages())
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
