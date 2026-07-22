import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { brandingService } from "@/services/branding.service"
import { limitService } from "@/services/billing/limit.service"
import { updateBrandingSchema } from "@/validations/branding"
import { ok, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (_req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const branding = await brandingService.get(workspaceId)
    return ok(branding)
  } catch (error) {
    return handleServiceError(error)
  }
})

export const PATCH = requireWorkspacePermission("update:branding")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    // Entitlements Sprint Phase 3 — CUSTOM_BRANDING was never gated by plan
    // before (audited: RBAC role check only, no feature check). Shadow-mode
    // by default — net-new enforcement, never a regression. Approximates
    // the blueprint's BRANDING_BASIC/CUSTOM_BRANDING distinction with a
    // single check against the fuller tier (this endpoint updates all
    // branding fields together; splitting it per-field is deferred until
    // there's a product reason to).
    const featureCheck = await limitService.canUseFeature(workspaceId, "CUSTOM_BRANDING")
    if (!featureCheck.allowed) return forbidden(featureCheck.reason ?? "Custom branding is not available on your plan")

    const body    = await req.json()
    const input   = updateBrandingSchema.parse(body)
    const updated = await brandingService.update(workspaceId, user.sub, input)
    return ok(updated, "Branding updated successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
