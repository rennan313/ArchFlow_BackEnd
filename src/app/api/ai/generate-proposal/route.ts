import { type NextRequest } from "next/server"
import { requireProposalLimit } from "@/middlewares/limits"
import { aiRateLimit } from "@/middlewares/rateLimiter"
import { generationService } from "@/services/ai/generation.service"
import { proposalService } from "@/services/proposal.service"
import { brandingService } from "@/services/branding.service"
import { generatePremiumProposalSchema } from "@/validations/ai-proposal"
import { ok, internalError } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import type { JwtPayload } from "@/lib/jwt"

export const maxDuration = 60

export const POST = requireProposalLimit(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  const limited = aiRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = generatePremiumProposalSchema.parse(body)

    // 1. Fetch office branding context
    const branding = await brandingService.getBrandingContext(user.sub)

    // 2. Generate premium structured proposal via AI
    const result = await generationService.generate(input, branding ?? undefined)

    // 3. Persist proposal — include workspaceId for multi-tenant queries
    const saved = await proposalService.create(user.sub, {
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

    await proposalService.update(saved!.id, user.sub, {
      generatedProposalJson: JSON.stringify(result.proposal),
      proposalTone:          result.tone,
      architectureStyle:     input.style ?? "Contemporâneo",
      ...(user.workspaceId   && { workspaceId: user.workspaceId }),
    } as Parameters<typeof proposalService.update>[2])

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
