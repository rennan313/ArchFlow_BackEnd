import { prisma } from "@/lib/prisma"
import { documentRepository } from "@/repositories/document.repository"
import { storageService } from "@/services/storage/supabase.service"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { UPLOAD_DOCUMENT_TYPES } from "@/validations/document"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import { planService } from "@/services/billing/plan.service"
import { storageUsageService } from "@/services/billing/storageUsage.service"
// storageUsageService.reserve/release are the standalone (self-transacting)
// wrappers — used here rather than reserveAndIncrement/decrement directly,
// since document creation isn't already inside its own transaction to
// compose a `tx` into.
import path from "path"
import type { DocumentQueryInput, CreateDocumentFolderInput, DocumentFolderQueryInput } from "@/validations/document"

function resolveType(filename: string) {
  const ext  = path.extname(filename).toLowerCase()
  const type = UPLOAD_DOCUMENT_TYPES[ext]
  if (!type) throw new Error(`UNSUPPORTED_FILE_TYPE:${ext}`)
  return type
}

async function refreshVersionUrls<T extends { versions: { storagePath: string; url: string }[] }>(doc: T): Promise<T> {
  const versions = await Promise.all(
    doc.versions.map(async (v) => {
      try {
        return { ...v, url: await storageService.refreshDocumentUrl(v.storagePath) }
      } catch {
        return v
      }
    }),
  )
  return { ...doc, versions }
}

export const documentService = {
  async list(workspaceId: string, query: DocumentQueryInput) {
    const { data, total } = await documentRepository.findMany(workspaceId, query)
    const refreshed = await Promise.all(data.map(refreshVersionUrls))
    return { data: refreshed, pagination: buildMeta(total, query.page, query.limit) }
  },

  async listRecent(workspaceId: string, limit: number) {
    const docs = await documentRepository.listRecent(workspaceId, limit)
    return Promise.all(docs.map(refreshVersionUrls))
  },

  async getById(id: string, workspaceId: string) {
    const document = await documentRepository.findById(id, workspaceId)
    if (!document) throw new AppError(ErrorCode.DOCUMENT_NOT_FOUND)
    return refreshVersionUrls(document)
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

    // Entitlements Sprint "close the debts" (2026-07) — real storage
    // reservation, fails before touching Supabase (same fail-fast-before-
    // external-call spirit as the tenant-reference check above). See the
    // matching comment in media.service.ts#upload for why this isn't fully
    // atomic with the upload itself.
    const { limits } = await planService.getEntitlements(workspaceId)
    await storageUsageService.reserve(workspaceId, file.size, limits.storageBytes)

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

    // A new version adds bytes on top of every prior version — the whole
    // history stays retrievable (documentRepository.addVersion never drops
    // old versions), so it's a pure addition to storage, never a swap.
    const { limits } = await planService.getEntitlements(workspaceId)
    await storageUsageService.reserve(workspaceId, file.size, limits.storageBytes)

    const uploaded = await storageService.uploadDocument(workspaceId, file, isImage)
    const updated  = await documentRepository.addVersion(
      id,
      workspaceId,
      userId,
      document.currentVersion + 1,
      { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, url: uploaded.url, storagePath: uploaded.storagePath },
    )
    if (!updated) throw new AppError(ErrorCode.DOCUMENT_NOT_FOUND)
    return updated
  },

  // Categoria B soft-delete: archiving must stay restorable, so the
  // underlying storage files are deliberately left untouched here — a
  // physical delete().versions cleanup would make restore() come back with
  // dead file links.
  async delete(id: string, workspaceId: string, userId: string) {
    await this.getById(id, workspaceId)
    await entityLifecycleService.archive({
      entity: "Document", id, workspaceId, userId,
      delegate: prisma.document,
    })
  },

  async restore(id: string, workspaceId: string, userId: string) {
    await entityLifecycleService.restore({
      entity: "Document", id, workspaceId, userId,
      delegate: prisma.document,
    })
    return this.getById(id, workspaceId)
  },

  async createFolder(workspaceId: string, userId: string, input: CreateDocumentFolderInput) {
    await assertWorkspaceReferences(workspaceId, { clientId: input.clientId, projectId: input.projectId })
    return documentRepository.createFolder(workspaceId, userId, input)
  },

  async listFolders(workspaceId: string, query: DocumentFolderQueryInput) {
    return documentRepository.findFolders(workspaceId, query)
  },
}
