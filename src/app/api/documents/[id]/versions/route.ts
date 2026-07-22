import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { documentService } from "@/services/document.service"
import { created, badRequest } from "@/lib/response"
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

    // Entitlements Sprint — redundant pre-check removed, see the matching
    // comment in documents/route.ts. documentService.addVersion reserves
    // real storage before touching Supabase.
    const document = await documentService.addVersion(id, workspaceId, user.sub, file)
    return created(document, "New version uploaded successfully")
  } catch (error) {
    const unsupportedType = parseUnsupportedFileType(error)
    if (unsupportedType) return badRequest(`Unsupported file type: ${unsupportedType}. Allowed: PDF, JPG, PNG, DWG, DOCX`)
    return handleServiceError(error)
  }
})
