import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import path from "path"

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "proposal-media"
const SIGNED_URL_EXPIRES = 60 * 60 * 24 // 24 hours

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100 MB

export type UploadCategory = "image" | "gif" | "video"

export interface UploadResult {
  url:         string
  storagePath: string
  thumbnail:   string | null
}

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase credentials are not configured")
  return createClient(url, key)
}

function buildPath(proposalId: string, category: UploadCategory, filename: string): string {
  const ext  = path.extname(filename).toLowerCase()
  const uuid = randomUUID()
  return `${proposalId}/${category}/${uuid}${ext}`
}

export const storageService = {
  async uploadFile(
    proposalId: string,
    file:       File,
    category:   UploadCategory,
  ): Promise<UploadResult> {
    // Validate type and size
    if (category === "video") {
      if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
        throw new Error(`Unsupported video type: ${file.type}`)
      }
      if (file.size > MAX_VIDEO_SIZE) {
        throw new Error("Video file exceeds maximum size of 100 MB")
      }
    } else {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error(`Unsupported image type: ${file.type}`)
      }
      if (file.size > MAX_IMAGE_SIZE) {
        throw new Error("Image file exceeds maximum size of 10 MB")
      }
    }

    const supabase    = getClient()
    const storagePath = buildPath(proposalId, category, file.name)
    const buffer      = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert:      false,
      })

    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRES)

    if (signedError || !signedData) {
      throw new Error(`Failed to create signed URL: ${signedError?.message}`)
    }

    // For images, thumbnail = same URL (no server-side resize in MVP)
    const thumbnail = category !== "video" ? signedData.signedUrl : null

    return {
      url:         signedData.signedUrl,
      storagePath,
      thumbnail,
    }
  },

  async getSignedUrl(storagePath: string): Promise<string> {
    const supabase = getClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRES)

    if (error || !data) throw new Error(`Failed to get signed URL: ${error?.message}`)
    return data.signedUrl
  },

  async deleteFile(storagePath: string): Promise<void> {
    const supabase = getClient()
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath])
    if (error) throw new Error(`Storage delete failed: ${error.message}`)
  },

  async refreshSignedUrls(
    items: { id: string; storagePath: string | null; url: string }[],
  ): Promise<{ id: string; url: string }[]> {
    const supabase = getClient()
    const results: { id: string; url: string }[] = []

    await Promise.all(
      items.map(async (item) => {
        if (!item.storagePath) {
          results.push({ id: item.id, url: item.url })
          return
        }
        try {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(item.storagePath, SIGNED_URL_EXPIRES)
          results.push({ id: item.id, url: data?.signedUrl ?? item.url })
        } catch {
          results.push({ id: item.id, url: item.url })
        }
      }),
    )

    return results
  },
}
