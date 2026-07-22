import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withWorkspace } from "@/middlewares/auth"
import { aiCreditPurchaseService } from "@/services/billing/aiCreditPurchase.service"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// GET — poll the status of a single credit purchase (pending → approved/
// rejected/cancelled), for the frontend checkout-return screen. Scoped to
// the authenticated workspace inside the service — a purchase belonging to
// another workspace 404s exactly like a nonexistent one.
export const GET = withWorkspace(
  async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
    try {
      const { id } = await ctx.params
      return ok(await aiCreditPurchaseService.getById(id, workspaceId))
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
