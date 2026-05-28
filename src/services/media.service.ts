import { mediaRepository } from "@/repositories/media.repository"
import { storageService, type UploadCategory } from "@/services/storage/supabase.service"
import {
  UPLOAD_MEDIA_TYPES,
  getYouTubeThumbnail,
  getYouTubeEmbedUrl,
  getVimeoEmbedUrl,
  type AddEmbedInput,
  type ReorderMediaInput,
  type UpdateMediaInput,
} from "@/validations/media"
import type { MediaType } from "@prisma/client"

const MAX_MEDIA_PER_PROPOSAL = 50

export const mediaService = {
  async list(proposalId: string) {
    const items = await mediaRepository.findAll(proposalId)

    // Refresh signed URLs for stored files
    const withStorage = items.filter((m) => m.storagePath)
    if (withStorage.length > 0) {
      const refreshed = await storageService.refreshSignedUrls(
        withStorage.map((m) => ({ id: m.id, storagePath: m.storagePath, url: m.url })),
      )
      const urlMap = new Map(refreshed.map((r) => [r.id, r.url]))
      return items.map((m) => ({
        ...m,
        url: urlMap.get(m.id) ?? m.url,
      }))
    }

    return items
  },

  async upload(proposalId: string, file: File) {
    const count = await mediaRepository.countByProposal(proposalId)
    if (count >= MAX_MEDIA_PER_PROPOSAL) {
      throw new Error("MEDIA_LIMIT_REACHED")
    }

    const category = UPLOAD_MEDIA_TYPES[file.type]
    if (!category) throw new Error(`UNSUPPORTED_FILE_TYPE:${file.type}`)

    const mediaType: MediaType =
      category === "gif" ? "GIF" :
      category === "video" ? "VIDEO" : "IMAGE"

    const result = await storageService.uploadFile(proposalId, file, category)
    const order  = count

    return mediaRepository.create({
      proposal:    { connect: { id: proposalId } },
      type:        mediaType,
      url:         result.url,
      storagePath: result.storagePath,
      thumbnail:   result.thumbnail,
      order,
    })
  },

  async addEmbed(proposalId: string, input: AddEmbedInput) {
    const count = await mediaRepository.countByProposal(proposalId)
    if (count >= MAX_MEDIA_PER_PROPOSAL) throw new Error("MEDIA_LIMIT_REACHED")

    let url       = input.url
    let thumbnail: string | null = null

    if (input.type === "YOUTUBE") {
      url       = getYouTubeEmbedUrl(input.url) ?? input.url
      thumbnail = getYouTubeThumbnail(input.url)
    } else if (input.type === "VIMEO") {
      url = getVimeoEmbedUrl(input.url) ?? input.url
    }

    return mediaRepository.create({
      proposal:    { connect: { id: proposalId } },
      type:        input.type,
      url,
      thumbnail,
      title:       input.title,
      description: input.description,
      order:       input.order ?? count,
    })
  },

  async update(mediaId: string, proposalId: string, input: UpdateMediaInput) {
    const media = await mediaRepository.findById(mediaId, proposalId)
    if (!media) throw new Error("NOT_FOUND")
    await mediaRepository.update(mediaId, proposalId, input)
    return mediaRepository.findById(mediaId, proposalId)
  },

  async delete(mediaId: string, proposalId: string) {
    const media = await mediaRepository.findById(mediaId, proposalId)
    if (!media) throw new Error("NOT_FOUND")

    // Delete from Supabase if it's a stored file
    if (media.storagePath) {
      await storageService.deleteFile(media.storagePath).catch(() => {
        // Log but don't fail if storage delete fails
        console.warn(`[media] Failed to delete storage path: ${media.storagePath}`)
      })
    }

    await mediaRepository.delete(mediaId, proposalId)
  },

  async reorder(proposalId: string, input: ReorderMediaInput) {
    await mediaRepository.reorder(proposalId, input.items)
    return mediaRepository.findAll(proposalId)
  },
}
