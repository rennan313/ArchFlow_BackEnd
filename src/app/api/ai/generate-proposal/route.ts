import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { generationService } from "@/services/ai/generation.service"
import { proposalService } from "@/services/proposal.service"
import { generatePremiumProposalSchema } from "@/validations/ai-proposal"
import { ok, internalError } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const maxDuration = 60 // seconds — allow time for AI generation

export const POST = withAuth(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const body  = await req.json()
    const input = generatePremiumProposalSchema.parse(body)

    // 1. Generate premium structured proposal via AI
    const result = await generationService.generate(input)

    // 2. Persist proposal with structured JSON
    const saved = await proposalService.create(user.sub, {
      clientName:          input.clientName,
      projectType:         input.projectType,
      squareMeters:        input.squareMeters ?? 1,
      city:                input.city ?? "Não informado",
      style:               input.style ?? "Contemporâneo",
      scope:               input.projectObjective ?? `Projeto ${input.projectType} para ${input.clientName}.`,
      priorities:          input.priorities,
      budget:              input.budget,
      timeline:            input.timeline,
      meetingNotes:        input.meetingNotes,
      pricingMethod:       input.pricingMethod,
      estimatedTotal:      input.estimatedValue,
      complexity:          input.complexity,
      // Store both: legacy text field and new structured JSON
      generatedText:       JSON.stringify(result.proposal),
      status:              "DRAFT",
    })

    // 3. Update with structured proposal JSON and metadata
    await proposalService.update(saved!.id, user.sub, {
      generatedProposalJson: JSON.stringify(result.proposal),
      proposalTone:          result.tone,
    } as Parameters<typeof proposalService.update>[2])

    return ok(
      {
        proposalId: saved!.id,
        proposal:   result.proposal,
        tone:       result.tone,
        model:      result.model,
        tokensUsed: result.tokensUsed,
      },
      "Premium proposal generated successfully",
    )
  } catch (error) {
    console.error("[generate-proposal]", error)
    if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
      return internalError("AI service is not configured")
    }
    return handleServiceError(error)
  }
})
