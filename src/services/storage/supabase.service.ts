import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { env } from "@/lib/env"
import path from "path"

const BUCKET         = env.supabaseStorageBucket
const SIGNED_URL_TTL = 60 * 60 * 24       // 24 hours — proposal media
const BRANDING_TTL   = 60 * 60 * 24 * 7   // 7 days  — branding assets

const ALLOWED_IMAGE_TYPES    = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const ALLOWED_BRANDING_TYPES = new Set(["image/png", "image/svg+xml", "image/webp", "image/jpeg"])
const ALLOWED_VIDEO_TYPES    = new Set(["video/mp4", "video/webm", "video/quicktime"])
const MAX_IMAGE_SIZE         = 10 * 1024 * 1024   // 10 MB
const MAX_BRANDING_ASSET_SIZE = 5 * 1024 * 1024   //  5 MB
const MAX_VIDEO_SIZE         = 100 * 1024 * 1024  // 100 MB

const DOCUMENT_TTL              = 60 * 60 * 24       // 24 hours — signed URL for documents
const MAX_DOCUMENT_IMAGE_SIZE   = 10 * 1024 * 1024   //  10 MB — JPG/PNG
const MAX_DOCUMENT_FILE_SIZE    = 50 * 1024 * 1024   //  50 MB — PDF/DOCX/DWG

export type UploadCategory    = "image" | "gif" | "video"
export type BrandingAssetType = "logo" | "logo-white" | "favicon"

export interface UploadResult {
  url:         string
  storagePath: string
  thumbnail:   string | null
}

export interface BrandingUploadResult {
  url:         string
  storagePath: string
}

export interface DocumentUploadResult {
  url:         string
  storagePath: string
}

function getClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey)
}

function buildPath(scopeId: string, category: UploadCategory, filename: string): string {
  const ext  = path.extname(filename).toLowerCase()
  const uuid = randomUUID()
  return `${scopeId}/${category}/${uuid}${ext}`
}

function brandingPath(userId: string, assetType: BrandingAssetType, filename: string): string {
  const ext = path.extname(filename).toLowerCase() || ".png"
  return `branding/${userId}/${assetType}${ext}`
}

export const storageService = {
  async uploadFile(proposalId: string, file: File, category: UploadCategory): Promise<UploadResult> {
    if (category === "video") {
      if (!ALLOWED_VIDEO_TYPES.has(file.type)) throw new Error(`Unsupported video type: ${file.type}`)
      if (file.size > MAX_VIDEO_SIZE)           throw new Error("Video file exceeds 100 MB limit")
    } else {
      if (!ALLOWED_IMAGE_TYPES.has(file.type))  throw new Error(`Unsupported image type: ${file.type}`)
      if (file.size > MAX_IMAGE_SIZE)            throw new Error("Image file exceeds 10 MB limit")
    }

    const supabase    = getClient()
    const storagePath = buildPath(proposalId, category, file.name)
    const buffer      = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET).upload(storagePath, buffer, { contentType: file.type, upsert: false })
    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL)
    if (signedError || !signedData) throw new Error(`Failed to create signed URL: ${signedError?.message}`)

    return {
      url:         signedData.signedUrl,
      storagePath,
      thumbnail:   category !== "video" ? signedData.signedUrl : null,
    }
  },

  async getSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await getClient().storage
      .from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL)
    if (error || !data) throw new Error(`Failed to get signed URL: ${error?.message}`)
    return data.signedUrl
  },

  async deleteFile(storagePath: string): Promise<void> {
    const { error } = await getClient().storage.from(BUCKET).remove([storagePath])
    if (error) throw new Error(`Storage delete failed: ${error.message}`)
  },

  async refreshSignedUrls(
    items: { id: string; storagePath: string | null; url: string }[],
  ): Promise<{ id: string; url: string }[]> {
    const supabase  = getClient()
    const results: { id: string; url: string }[] = []

    await Promise.all(
      items.map(async (item) => {
        if (!item.storagePath) { results.push({ id: item.id, url: item.url }); return }
        try {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(item.storagePath, SIGNED_URL_TTL)
          results.push({ id: item.id, url: data?.signedUrl ?? item.url })
        } catch {
          results.push({ id: item.id, url: item.url })
        }
      }),
    )
    return results
  },

  async uploadBrandingAsset(userId: string, assetType: BrandingAssetType, file: File): Promise<BrandingUploadResult> {
    if (!ALLOWED_BRANDING_TYPES.has(file.type)) {
      throw new Error(`Unsupported format: ${file.type}. Allowed: PNG, SVG, WEBP, JPEG`)
    }
    if (file.size > MAX_BRANDING_ASSET_SIZE) {
      throw new Error("Asset exceeds 5 MB limit")
    }

    const supabase    = getClient()
    const storagePath = brandingPath(userId, assetType, file.name)
    const buffer      = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET).upload(storagePath, buffer, { contentType: file.type, upsert: true })
    if (error) throw new Error(`Branding upload failed: ${error.message}`)

    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET).createSignedUrl(storagePath, BRANDING_TTL)
    if (signedError || !signedData) throw new Error(`Failed to create signed URL: ${signedError?.message}`)

    return { url: signedData.signedUrl, storagePath }
  },

  async refreshBrandingUrl(storagePath: string): Promise<string> {
    const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(storagePath, BRANDING_TTL)
    if (error || !data) throw new Error(`Failed to refresh branding URL: ${error?.message}`)
    return data.signedUrl
  },

  async uploadDocument(workspaceId: string, file: File, isImage: boolean): Promise<DocumentUploadResult> {
    const maxSize = isImage ? MAX_DOCUMENT_IMAGE_SIZE : MAX_DOCUMENT_FILE_SIZE
    if (file.size > maxSize) {
      throw new Error(`File exceeds ${maxSize / (1024 * 1024)} MB limit`)
    }

    const supabase    = getClient()
    const ext         = path.extname(file.name).toLowerCase()
    const storagePath = `documents/${workspaceId}/${randomUUID()}${ext}`
    const buffer      = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET).upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false })
    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET).createSignedUrl(storagePath, DOCUMENT_TTL)
    if (signedError || !signedData) throw new Error(`Failed to create signed URL: ${signedError?.message}`)

    return { url: signedData.signedUrl, storagePath }
  },

  async refreshDocumentUrl(storagePath: string): Promise<string> {
    const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(storagePath, DOCUMENT_TTL)
    if (error || !data) throw new Error(`Failed to refresh document URL: ${error?.message}`)
    return data.signedUrl
  },
}
