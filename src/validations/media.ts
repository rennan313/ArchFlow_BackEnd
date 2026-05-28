import { z } from "zod"

export const MediaTypeEnum = z.enum(["IMAGE", "GIF", "VIDEO", "YOUTUBE", "VIMEO"])

// YouTube URL patterns
const youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
// Vimeo URL patterns
const vimeoRegex   = /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/

export const addEmbedSchema = z.discriminatedUnion("type", [
  z.object({
    type:        z.literal("YOUTUBE"),
    url:         z.string().regex(youtubeRegex, "Invalid YouTube URL"),
    title:       z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    order:       z.number().int().nonnegative().optional(),
  }),
  z.object({
    type:        z.literal("VIMEO"),
    url:         z.string().regex(vimeoRegex, "Invalid Vimeo URL"),
    title:       z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    order:       z.number().int().nonnegative().optional(),
  }),
])

export const reorderMediaSchema = z.object({
  items: z.array(
    z.object({
      mediaId: z.string().min(1),
      order:   z.number().int().nonnegative(),
    }),
  ).min(1),
})

export const updateMediaSchema = z.object({
  title:       z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
})

export type AddEmbedInput    = z.infer<typeof addEmbedSchema>
export type ReorderMediaInput = z.infer<typeof reorderMediaSchema>
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>

export function extractYouTubeId(url: string): string | null {
  const match = url.match(youtubeRegex)
  return match?.[1] ?? null
}

export function extractVimeoId(url: string): string | null {
  const match = url.match(vimeoRegex)
  return match?.[1] ?? null
}

export function getYouTubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

export function getVimeoEmbedUrl(url: string): string | null {
  const id = extractVimeoId(url)
  return id ? `https://player.vimeo.com/video/${id}` : null
}

export function getYouTubeEmbedUrl(url: string): string | null {
  const id = extractYouTubeId(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

export const UPLOAD_MEDIA_TYPES: Record<string, "image" | "gif" | "video"> = {
  "image/jpeg":    "image",
  "image/png":     "image",
  "image/webp":    "image",
  "image/gif":     "gif",
  "video/mp4":     "video",
  "video/webm":    "video",
  "video/quicktime": "video",
}
