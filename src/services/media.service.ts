import { mediaRepository } from "@/repositories/media.repository"
import { storageService, type UploadCategory } from "@/services/storage/supabase.service"
import { logger } from "@/lib/logger"
import { AppError, ErrorCode } from "@/lib/errors"
import { planService } from "@/services/billing/plan.service"
import { storageUsageService } from "@/services/billing/storageUsage.service"
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
  async list(proposalId: string, workspaceId: string) {
    const items = await mediaRepository.findAll(proposalId, workspaceId)

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

  async upload(proposalId: string, workspaceId: string, file: File) {
    const count = await mediaRepository.countByProposal(proposalId, workspaceId)
    if (count >= MAX_MEDIA_PER_PROPOSAL) {
      throw new AppError(ErrorCode.MEDIA_LIMIT_REACHED)
    }

    const category = UPLOAD_MEDIA_TYPES[file.type]
    if (!category) throw new Error(`UNSUPPORTED_FILE_TYPE:${file.type}`)

    const mediaType: MediaType =
      category === "gif" ? "GIF" :
      category === "video" ? "VIDEO" : "IMAGE"

    // Entitlements Sprint Phase "close the debts" (2026-07) — real storage
    // reservation, fails BEFORE touching Supabase storage (same
    // fail-fast-before-external-call pattern documentService.create already
    // uses for tenant references). Not fully atomic with the Supabase
    // upload/ProposalMedia create below (those aren't in this transaction)
    // — nightly reconciliation (storageUsageService.reconcileWorkspace) is
    // the correctness backstop for any drift, same as everywhere else this
    // service is used.
    const { limits } = await planService.getEntitlements(workspaceId)
    await storageUsageService.reserve(workspaceId, file.size, limits.storageBytes)

    const result = await storageService.uploadFile(proposalId, file, category)
    const order  = count

    return mediaRepository.create({
      proposal:    { connect: { id: proposalId } },
      type:        mediaType,
      url:         result.url,
      storagePath: result.storagePath,
      thumbnail:   result.thumbnail,
      sizeBytes:   file.size,
      order,
    })
  },

  async addEmbed(proposalId: string, workspaceId: string, input: AddEmbedInput) {
    const count = await mediaRepository.countByProposal(proposalId, workspaceId)
    if (count >= MAX_MEDIA_PER_PROPOSAL) throw new AppError(ErrorCode.MEDIA_LIMIT_REACHED)

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

  async update(mediaId: string, proposalId: string, workspaceId: string, input: UpdateMediaInput) {
    const media = await mediaRepository.findById(mediaId, proposalId, workspaceId)
    if (!media) throw new AppError(ErrorCode.NOT_FOUND)
    await mediaRepository.update(mediaId, proposalId, workspaceId, input)
    return mediaRepository.findById(mediaId, proposalId, workspaceId)
  },

  async delete(mediaId: string, proposalId: string, workspaceId: string) {
    const media = await mediaRepository.findById(mediaId, proposalId, workspaceId)
    if (!media) throw new AppError(ErrorCode.NOT_FOUND)

    // Delete from Supabase if it's a stored file
    if (media.storagePath) {
      await storageService.deleteFile(media.storagePath).catch(() => {
        logger.warn({ storagePath: media.storagePath }, "[media] Failed to delete storage file — manual cleanup may be needed")
      })
    }

    await mediaRepository.delete(mediaId, proposalId, workspaceId)

    // No limit check on free — see storageUsage.service.ts#decrement.
    // media.sizeBytes is null for anything uploaded before this sprint
    // (backfill's documented, accepted undercount) — decrementing by 0 is a
    // safe no-op rather than corrupting the counter with a guessed value.
    if (media.sizeBytes) {
      await storageUsageService.release(workspaceId, media.sizeBytes)
    }
  },

  async reorder(proposalId: string, workspaceId: string, input: ReorderMediaInput) {
    await mediaRepository.reorder(proposalId, workspaceId, input.items)
    return mediaRepository.findAll(proposalId, workspaceId)
  },
}
