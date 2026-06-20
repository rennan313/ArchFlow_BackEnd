import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { brandingService } from "@/services/branding.service"
import { ok, badRequest } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const POST = requireWorkspacePermission("update:branding")(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload, workspaceId: string) => {
  try {
    const formData = await req.formData()
    const file     = formData.get("file")

    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required')
    }

    const result = await brandingService.uploadAsset(workspaceId, user.sub, "logo-white", file)
    return ok(result, "White logo uploaded successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
