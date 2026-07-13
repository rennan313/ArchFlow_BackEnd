import { type NextRequest } from "next/server"
import { requireProposalLimit } from "@/middlewares/limits"
import { aiRateLimit } from "@/middlewares/rateLimiter"
import { hasPermission } from "@/middlewares/rbac"
import { premiumNarrativeGenerationService } from "@/services/ai/premium-narrative-generation.service"
import { proposalService } from "@/services/proposal.service"
import { brandingService } from "@/services/branding.service"
import { projectService } from "@/services/project.service"
import { mediaRepository } from "@/repositories/media.repository"
import { getYouTubeEmbedUrl, getYouTubeThumbnail, getVimeoEmbedUrl } from "@/validations/media"
import { generatePremiumProposalSchema } from "@/validations/ai-proposal"
import { ok, internalError, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import type { JwtPayload } from "@/lib/jwt"
import type { ProjectType } from "@/validations/project"
import type { MediaType } from "@prisma/client"

// Fase A — Proposal Experience v2. Mirrors generate-proposal/route.ts's
// persistence/media/project steps, but calls the premium-narrative generation
// service and writes generatedText with the schemaVersion marker that the
// Builder's initialize() premium branch keys off. The legacy route stays
// untouched for backward compat.

const PROJECT_TYPE_BY_LABEL: Record<string, ProjectType> = {
  residencial: "RESIDENTIAL", comercial: "COMMERCIAL", reforma: "RENOVATION",
  interiores: "INTERIOR", urbanismo: "URBAN", paisagismo: "LANDSCAPE",
}
function inferProjectType(label: string): ProjectType {
  return PROJECT_TYPE_BY_LABEL[label.trim().toLowerCase()] ?? "RESIDENTIAL"
}

export const maxDuration = 60

export const POST = requireProposalLimit(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload, workspaceId: string) => {
  if (!hasPermission(user.workspaceRole ?? "VIEWER", "create:proposals")) {
    return forbidden("Permission denied: create:proposals")
  }

  const limited = await aiRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = generatePremiumProposalSchema.parse(body)

    // 1. Office branding context (also denormalized into the cover later)
    const branding = await brandingService.getBrandingContext(workspaceId)

    // 2. Generate the 12-page structured narrative via AI (single call).
    //    No library context — the premium flow is a fixed narrative, not the
    //    pick-from-catalog system the legacy generation uses as reference.
    const result = await premiumNarrativeGenerationService.generate(input, branding ?? undefined)

    // 3. Persist proposal. generatedText carries the schemaVersion marker —
    //    this is what routes the Builder's initialize() into the premium
    //    branch instead of the legacy PremiumProposal flattening path.
    const outputJson = JSON.stringify(result.output)
    const saved = await proposalService.create(workspaceId, user.sub, {
      clientId:      input.clientId,
      clientName:    input.clientName,
      projectType:   input.projectType,
      squareMeters:  input.squareMeters ?? 1,
      city:          input.city ?? "Não informado",
      style:         input.style ?? "Contemporâneo",
      scope:         input.projectObjective ?? `Projeto ${input.projectType} para ${input.clientName}.`,
      priorities:    input.priorities,
      budget:        input.budget,
      timeline:      input.timeline,
      meetingNotes:  input.meetingNotes,
      pricingMethod: input.pricingMethod,
      estimatedTotal: input.estimatedValue,
      complexity:    input.complexity,
      generatedText: outputJson,
      status:        "DRAFT",
    })

    await proposalService.update(saved!.id, workspaceId, {
      generatedProposalJson: outputJson,
      proposalTone:          result.tone,
      architectureStyle:     input.style ?? "Contemporâneo",
    })

    // 3.5. Persist visual references as ProposalMedia entries (non-fatal).
    //      The first IMAGE entry doubles as the cover's hero image (resolved
    //      by heroMediaId at initialize time, signed URL refreshed at render).
    const mediaEntries: Array<Promise<unknown>> = []

    if (input.imageRefs?.length) {
      input.imageRefs.forEach(({ url, storagePath }, order) => {
        mediaEntries.push(mediaRepository.create({
          proposal:    { connect: { id: saved!.id } },
          type:        "IMAGE" as MediaType,
          url,
          storagePath,
          thumbnail:   url,
          order,
        }))
      })
    }

    if (input.visualRefUrls?.length) {
      input.visualRefUrls.forEach((url, i) => {
        const isYoutube = /youtu\.?be/.test(url)
        const isVimeo   = /vimeo\.com/.test(url)
        const type: MediaType = isYoutube ? "YOUTUBE" : isVimeo ? "VIMEO" : "IMAGE"
        const embedUrl  = isYoutube ? (getYouTubeEmbedUrl(url) ?? url) : isVimeo ? (getVimeoEmbedUrl(url) ?? url) : url
        const thumbnail = isYoutube ? getYouTubeThumbnail(url) : null
        mediaEntries.push(mediaRepository.create({
          proposal:  { connect: { id: saved!.id } },
          type,
          url:       embedUrl,
          thumbnail,
          order:     (input.imageRefs?.length ?? 0) + i,
        }))
      })
    }

    if (mediaEntries.length > 0) {
      await Promise.all(mediaEntries).catch((err) => {
        logger.warn({ err }, "[generate-premium-narrative] failed to save visual ref media — non-fatal")
      })
    }

    // Project link — kept for parity with the legacy route (detail pages,
    // automations, and the cover's projectName all read from it).
    await projectService.create(workspaceId, user.sub, {
      clientId:     saved!.clientId!,
      proposalId:   saved!.id,
      name:         `Projeto ${input.clientName}`,
      type:         inferProjectType(input.projectType),
      status:       "BRIEFING",
      phase:        "BRIEFING",
      squareMeters: input.squareMeters,
      city:         input.city,
      state:        input.state,
    })

    return ok(
      {
        proposalId: saved!.id,
        narrative:  result.output,
        branding:   branding ?? null,
        tone:       result.tone,
        model:      result.model,
        tokensUsed: result.tokensUsed,
      },
      "Premium narrative proposal generated successfully",
    )
  } catch (error) {
    logger.error({ err: error }, "[generate-premium-narrative] generation failed")
    if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
      return internalError("AI service is not configured")
    }
    return handleServiceError(error)
  }
})
