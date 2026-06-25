import { type NextRequest } from "next/server"
import { requireProposalLimit } from "@/middlewares/limits"
import { aiRateLimit } from "@/middlewares/rateLimiter"
import { hasPermission } from "@/middlewares/rbac"
import { generationService } from "@/services/ai/generation.service"
import { proposalService } from "@/services/proposal.service"
import { brandingService } from "@/services/branding.service"
import { clientService } from "@/services/client.service"
import { projectService } from "@/services/project.service"
import { generatePremiumProposalSchema } from "@/validations/ai-proposal"
import { ok, internalError, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import type { JwtPayload } from "@/lib/jwt"
import type { ProjectType } from "@/validations/project"

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

  const limited = aiRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = generatePremiumProposalSchema.parse(body)

    // 1. Fetch office branding context
    const branding = await brandingService.getBrandingContext(workspaceId)

    // 2. Generate premium structured proposal via AI
    const result = await generationService.generate(input, branding ?? undefined)

    // 3. Persist proposal
    const saved = await proposalService.create(workspaceId, user.sub, {
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

    // Proposals from this flow never had a linked Client/Project — harmless
    // on its own, but the Proposal Builder's initialize step requires a
    // Project to run the advisor against, so every generated proposal needs
    // one to be builder-ready. Create a minimal Client (this flow never
    // collects a real one) + Project linked back to the proposal. Proposal.
    // clientId is intentionally left unset — Project.clientId is the only
    // link the builder/advisor actually needs, and `clientId` isn't part of
    // UpdateProposalInput's validated surface.
    const client = await clientService.create(workspaceId, user.sub, {
      name:          input.clientName,
      status:        "LEAD",
      meetingStatus: "NOT_SCHEDULED",
    })
    await projectService.create(workspaceId, user.sub, {
      clientId:     client.id,
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
