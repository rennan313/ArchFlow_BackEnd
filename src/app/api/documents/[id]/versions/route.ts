import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { documentService } from "@/services/document.service"
import { subscriptionService } from "@/services/subscription.service"
import { created, badRequest, forbidden } from "@/lib/response"
import { handleServiceError, parseUnsupportedFileType } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const POST = requireAnyWorkspacePermission("update:documents")(async (req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const formData = await req.formData()
    const file     = formData.get("file")

    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required and must be a file')
    }

    const sizeMb     = file.size / (1024 * 1024)
    const limitCheck = await subscriptionService.canUploadFile(workspaceId, sizeMb)
    if (!limitCheck.allowed) return forbidden(limitCheck.reason ?? "Storage limit reached")

    const document = await documentService.addVersion(id, workspaceId, user.sub, file)
    return created(document, "New version uploaded successfully")
  } catch (error) {
    const unsupportedType = parseUnsupportedFileType(error)
    if (unsupportedType) return badRequest(`Unsupported file type: ${unsupportedType}. Allowed: PDF, JPG, PNG, DWG, DOCX`)
    return handleServiceError(error)
  }
})
