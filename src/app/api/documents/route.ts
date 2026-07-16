import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { documentService } from "@/services/document.service"
import { subscriptionService } from "@/services/subscription.service"
import { documentQuerySchema } from "@/validations/document"
import { ok, created, badRequest, forbidden } from "@/lib/response"
import { handleServiceError, parseUnsupportedFileType } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = documentQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await documentService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

// DESIGNER reaches this via create:documents (uploading reference files is
// part of their workflow); ARCHITECT/ADMIN/ASSISTANT/OWNER via the same.
export const POST = requireAnyWorkspacePermission("create:documents")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const formData  = await req.formData()
    const file      = formData.get("file")
    const name      = formData.get("name")
    const clientId  = formData.get("clientId")
    const projectId = formData.get("projectId")
    const folderId  = formData.get("folderId")

    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required and must be a file')
    }

    const sizeMb     = file.size / (1024 * 1024)
    const limitCheck = await subscriptionService.canUploadFile(workspaceId, sizeMb)
    if (!limitCheck.allowed) return forbidden(limitCheck.reason ?? "Storage limit reached")

    const document = await documentService.create(workspaceId, user.sub, file, {
      name:      typeof name === "string" ? name : undefined,
      clientId:  typeof clientId === "string" && clientId ? clientId : undefined,
      projectId: typeof projectId === "string" && projectId ? projectId : undefined,
      folderId:  typeof folderId === "string" && folderId ? folderId : undefined,
    })
    return created(document, "Document uploaded successfully")
  } catch (error) {
    const unsupportedType = parseUnsupportedFileType(error)
    if (unsupportedType) return badRequest(`Unsupported file type: ${unsupportedType}. Allowed: PDF, JPG, PNG, DWG, DOCX`)
    return handleServiceError(error)
  }
})
