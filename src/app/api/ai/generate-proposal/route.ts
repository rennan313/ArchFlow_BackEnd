import { type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import { requireProposalLimit } from "@/middlewares/limits"
import { aiRateLimit } from "@/middlewares/rateLimiter"
import { hasPermission } from "@/middlewares/rbac"
import { generationService } from "@/services/ai/generation.service"
import { libraryContextService } from "@/services/ai/library-context.service"
import { proposalService } from "@/services/proposal.service"
import { brandingService } from "@/services/branding.service"
import { projectService } from "@/services/project.service"
import { aiCreditService } from "@/services/billing/aiCredit.service"
import { mediaRepository } from "@/repositories/media.repository"
import { getYouTubeEmbedUrl, getYouTubeThumbnail, getVimeoEmbedUrl } from "@/validations/media"
import { generatePremiumProposalSchema } from "@/validations/ai-proposal"
import { ok, internalError, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import type { JwtPayload } from "@/lib/jwt"
import type { ProjectType } from "@/validations/project"
import type { MediaType } from "@prisma/client"

// Mirrors opportunity.service.ts's inferProjectType — duplicated rather than
// imported to avoid coupling the AI generation route to the opportunities
// domain for a 6-line lookup. Same fallback behavior (unmapped labels, e.g.
// "Industrial", default to RESIDENTIAL).
const PROJECT_TYPE_BY_LABEL: Record<string, ProjectType> = {
  residencial: "RESIDENTIAL", comercial: "COMMERCIAL", reforma: "RENOVATION",
  interiores: "INTERIOR", urbanismo: "URBAN", paisagismo: "LANDSCAPE",
}
function inferProjectType(label: string): ProjectType {
  return PROJECT_TYPE_BY_LABEL[label.trim().toLowerCase()] ?? "RESIDENTIAL"
}

export const maxDuration = 60

// requireProposalLimit is built on withWorkspace, so the trial/subscription
// write-gate and the workspace-existence check both already ran before this
// handler runs. Generating a proposal is a creation action, gated the same
// as the manual POST /api/proposals route.
export const POST = requireProposalLimit(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload, workspaceId: string) => {
  if (!hasPermission(user.workspaceRole ?? "VIEWER", "create:proposals")) {
    return forbidden("Permission denied: create:proposals")
  }

  const limited = await aiRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = generatePremiumProposalSchema.parse(body)

    // Entitlements Sprint "close the debts" (2026-07) — debited AFTER input
    // validation (a malformed request never costs a credit) but BEFORE the
    // real Anthropic call (fail fast, never spend real AI cost on a request
    // that was going to be rejected anyway). idempotencyKey is fresh per
    // attempt (no client-supplied retry key exists for this route today) —
    // a network-level client retry is treated as a new attempt, same
    // tradeoff every other AI route in this codebase already accepts.
    // Refunded in the catch block below if generation fails after this
    // succeeds.
    const aiDebitKey = `ai-debit:generate-proposal:${randomUUID()}`
    const debit = await aiCreditService.debit({ workspaceId, operation: "proposta_completa", idempotencyKey: aiDebitKey })
    if (!debit.allowed) return forbidden(debit.reason ?? "AI credits exhausted")

    // 1. Fetch office branding context
    const branding = await brandingService.getBrandingContext(workspaceId)

    // 2. Fetch scored library blocks for this project — used as reference
    //    material in the AI prompt. Non-fatal: returns empty sections on error.
    const library = await libraryContextService.build(workspaceId, input)

    // 3. Generate premium structured proposal via AI
    let result
    try {
      result = await generationService.generate(input, branding ?? undefined, library)
    } catch (genError) {
      // Refund immediately — the debit above already committed, and the
      // outer catch below doesn't know which ledger entries to refund once
      // control leaves this inner scope.
      await aiCreditService.refund(workspaceId, debit.ledgerEntryIds, "generation_failed")
      throw genError
    }

    // 4. Persist proposal (resolves/creates the Client atomically — see
    //    proposalService.create)
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
      generatedText: JSON.stringify(result.proposal),
      status:        "DRAFT",
    })

    await proposalService.update(saved!.id, workspaceId, {
      generatedProposalJson: JSON.stringify(result.proposal),
      proposalTone:          result.tone,
      architectureStyle:     input.style ?? "Contemporâneo",
    })

    // 4.5. Persist visual references as ProposalMedia entries (non-fatal)
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
        logger.warn({ err }, "[generate-proposal] failed to save visual ref media — non-fatal")
      })
    }

    // The Proposal Builder's initialize step requires a Project to run the
    // advisor against, so every generated proposal needs one to be
    // builder-ready. Reuses the Client that proposalService.create already
    // resolved (existing client reused by id/name, or created minimally) —
    // never creates a second, duplicate Client here.
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
        proposal:   result.proposal,
        branding:   branding ?? null,
        tone:       result.tone,
        model:      result.model,
        tokensUsed: result.tokensUsed,
      },
      "Premium proposal generated successfully",
    )
  } catch (error) {
    logger.error({ err: error }, "[generate-proposal] generation failed")
    if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
      return internalError("AI service is not configured")
    }
    return handleServiceError(error)
  }
})
