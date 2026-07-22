import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { limitService } from "@/services/billing/limit.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

// Entitlements Sprint Phase 7 — swapped from subscriptionService.
// getUsageSummary to limitService.getUsageSummary. Read-only endpoint, so
// this can never block/regress anything (unlike the write-gating checks
// deliberately left on the old service elsewhere) — it's a superset shape
// (same subscription.* fields BillingClient.tsx already reads, plus the new
// per-limit usage the 5-bar widget needs).
export const GET = withWorkspace(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
  try {
    const summary = await limitService.getUsageSummary(workspaceId)
    return ok(summary)
  } catch (error) {
    return handleServiceError(error)
  }
})
