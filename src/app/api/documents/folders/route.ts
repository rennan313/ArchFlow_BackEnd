import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireAnyWorkspacePermission } from "@/middlewares/rbac"
import { documentService } from "@/services/document.service"
import { createDocumentFolderSchema, documentFolderQuerySchema } from "@/validations/document"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query = documentFolderQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return ok(await documentService.listFolders(workspaceId, query))
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireAnyWorkspacePermission("create:documents")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input = createDocumentFolderSchema.parse(await req.json())
    const folder = await documentService.createFolder(workspaceId, user.sub, input)
    return created(folder, "Folder created successfully")
  } catch (error) { return handleServiceError(error) }
})
