import { type NextRequest } from "next/server"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { created, badRequest } from "@/lib/response"
import { handleServiceError, parseUnsupportedFileType } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// DESIGNER reaches this via upload:media; ARCHITECT/ADMIN/ASSISTANT/OWNER via
// update:proposals (editing a proposal includes managing its media).
export const POST = requireAnyWorkspacePermission("upload:media", "update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params

    await proposalService.getById(id, workspaceId)

    const formData = await req.formData()
    const file     = formData.get("file")

    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required and must be a file')
    }

    // Entitlements Sprint — redundant pre-check removed, see the matching
    // comment in documents/route.ts. mediaService.upload reserves real
    // storage before touching Supabase.
    const media = await mediaService.upload(id, workspaceId, file)
    return created(media, "Media uploaded successfully")
  } catch (error) {
    const unsupportedType = parseUnsupportedFileType(error)
    if (unsupportedType) return badRequest(`Unsupported file type: ${unsupportedType}. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM, MOV`)
    return handleServiceError(error)
  }
})
