import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { brandingService } from "@/services/branding.service"
import { ok, badRequest } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const POST = withAuth(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const formData = await req.formData()
    const file     = formData.get("file")

    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required')
    }

    const result = await brandingService.uploadAsset(user.sub, "favicon", file)
    return ok(result, "Favicon uploaded successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
