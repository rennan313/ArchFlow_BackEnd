import { documentRepository } from "@/repositories/document.repository"
import { storageService } from "@/services/storage/supabase.service"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { UPLOAD_DOCUMENT_TYPES } from "@/validations/document"
import path from "path"
import type { DocumentQueryInput, CreateDocumentFolderInput, DocumentFolderQueryInput } from "@/validations/document"

function resolveType(filename: string) {
  const ext  = path.extname(filename).toLowerCase()
  const type = UPLOAD_DOCUMENT_TYPES[ext]
  if (!type) throw new Error(`UNSUPPORTED_FILE_TYPE:${ext}`)
  return type
}

export const documentService = {
  async list(workspaceId: string, query: DocumentQueryInput) {
    const { data, total } = await documentRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async listRecent(workspaceId: string, limit: number) {
    return documentRepository.listRecent(workspaceId, limit)
  },

  async getById(id: string, workspaceId: string) {
    const document = await documentRepository.findById(id, workspaceId)
    if (!document) throw new AppError(ErrorCode.DOCUMENT_NOT_FOUND)
    return document
  },

  async create(
    workspaceId: string,
    userId: string,
    file: File,
    meta: { name?: string; clientId?: string; projectId?: string; folderId?: string },
  ) {
    if (!meta.clientId && !meta.projectId) {
      throw new Error("VALIDATION:clientId or projectId is required")
    }
    // P0 #1 (Fase 5 audit) — validate before touching storage, so a
    // cross-tenant reference fails fast without uploading the file first.
    await assertWorkspaceReferences(workspaceId, {
      clientId:  meta.clientId,
      projectId: meta.projectId,
      folderId:  meta.folderId,
    })

    const type     = resolveType(file.name)
    const isImage  = type === "JPG" || type === "PNG"
    const uploaded = await storageService.uploadDocument(workspaceId, file, isImage)

    return documentRepository.create(
      workspaceId,
      userId,
      { name: meta.name?.trim() || file.name, type, clientId: meta.clientId, projectId: meta.projectId, folderId: meta.folderId },
      { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, url: uploaded.url, storagePath: uploaded.storagePath },
    )
  },

  async addVersion(id: string, workspaceId: string, userId: string, file: File) {
    const document = await this.getById(id, workspaceId)

    const type    = resolveType(file.name)
    const isImage = type === "JPG" || type === "PNG"
    if (type !== document.type) {
      throw new Error(`VALIDATION:new version must be the same file type (${document.type})`)
    }

    const uploaded = await storageService.uploadDocument(workspaceId, file, isImage)
    return documentRepository.addVersion(
      id,
      userId,
      document.currentVersion + 1,
      { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, url: uploaded.url, storagePath: uploaded.storagePath },
    )
  },

  async delete(id: string, workspaceId: string) {
    const document = await this.getById(id, workspaceId)
    await Promise.all(
      document.versions.map((v) =>
        storageService.deleteFile(v.storagePath).catch(() => {
          /* best-effort cleanup — DB row removal below is the source of truth */
        }),
      ),
    )
    await documentRepository.delete(id, workspaceId)
  },

  async createFolder(workspaceId: string, userId: string, input: CreateDocumentFolderInput) {
    await assertWorkspaceReferences(workspaceId, { clientId: input.clientId, projectId: input.projectId })
    return documentRepository.createFolder(workspaceId, userId, input)
  },

  async listFolders(workspaceId: string, query: DocumentFolderQueryInput) {
    return documentRepository.findFolders(workspaceId, query)
  },
}
