import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { brandingService } from "@/services/branding.service"
import { updateBrandingSchema } from "@/validations/branding"
import { ok } from "@/lib/response"
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
    const body    = await req.json()
    const input   = updateBrandingSchema.parse(body)
    const updated = await brandingService.update(workspaceId, user.sub, input)
    return ok(updated, "Branding updated successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
