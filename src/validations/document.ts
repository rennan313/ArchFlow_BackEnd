import { z } from "zod"

export const documentTypeSchema = z.enum(["PDF", "JPG", "PNG", "DWG", "DOCX"])

// DWG/DOCX MIME types are inconsistent across OSes/browsers (DWG in
// particular has no registered IANA type), so uploads are classified by
// file extension rather than the browser-reported Content-Type.
export const UPLOAD_DOCUMENT_TYPES: Record<string, z.infer<typeof documentTypeSchema>> = {
  ".pdf":  "PDF",
  ".jpg":  "JPG",
  ".jpeg": "JPG",
  ".png":  "PNG",
  ".dwg":  "DWG",
  ".docx": "DOCX",
}

export const documentQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(100).optional().default(20),
  search:    z.string().optional(),
  type:      documentTypeSchema.optional(),
  clientId:  z.string().optional(),
  projectId: z.string().optional(),
  folderId:  z.string().optional(),
  sortBy:    z.enum(["name", "createdAt", "updatedAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
})

export const createDocumentFolderSchema = z.object({
  name:      z.string().min(1).max(100),
  clientId:  z.string().optional(),
  projectId: z.string().optional(),
}).refine((v) => Boolean(v.clientId) !== Boolean(v.projectId), {
  message: "Exactly one of clientId or projectId is required",
})

export const documentFolderQuerySchema = z.object({
  clientId:  z.string().optional(),
  projectId: z.string().optional(),
})

export type DocumentType            = z.infer<typeof documentTypeSchema>
export type DocumentQueryInput      = z.infer<typeof documentQuerySchema>
export type CreateDocumentFolderInput = z.infer<typeof createDocumentFolderSchema>
export type DocumentFolderQueryInput  = z.infer<typeof documentFolderQuerySchema>
