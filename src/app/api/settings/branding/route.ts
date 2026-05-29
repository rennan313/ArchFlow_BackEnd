import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { brandingService } from "@/services/branding.service"
import { updateBrandingSchema } from "@/validations/branding"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withAuth(async (_req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const branding = await brandingService.get(user.sub)
    return ok(branding)
  } catch (error) {
    return handleServiceError(error)
  }
})

export const PATCH = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const body    = await req.json()
    const input   = updateBrandingSchema.parse(body)
    const updated = await brandingService.update(user.sub, input)
    return ok(updated, "Branding updated successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
