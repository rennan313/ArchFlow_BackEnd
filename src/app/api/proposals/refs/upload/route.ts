import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { storageService } from "@/services/storage/supabase.service"
import { ok, badRequest } from "@/lib/response"
import { handleServiceError, parseUnsupportedFileType } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const POST = requireAnyWorkspacePermission("create:proposals")(async (
  req: NextRequest,
  _ctx: unknown,
  _user: JwtPayload,
  workspaceId: string,
) => {
  try {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return badRequest("Falha ao parsear multipart/form-data")
    }

    const file = formData.get("file")
    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required and must be a file')
    }

    const result = await storageService.uploadVisualRef(workspaceId, file)
    return ok({ url: result.url, storagePath: result.storagePath }, "Visual ref uploaded")
  } catch (error) {
    const unsupportedType = parseUnsupportedFileType(error)
    if (unsupportedType) return badRequest(`Unsupported file type: ${unsupportedType}. Allowed: JPEG, PNG, WebP, GIF`)
    return handleServiceError(error)
  }
})
