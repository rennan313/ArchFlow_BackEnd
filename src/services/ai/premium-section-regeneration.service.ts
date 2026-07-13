// Fase B — regenerates ONE premium-narrative section's payload via a small
// dedicated Haiku call, reusing the exact same shared project context, schema
// fragments (premium-narrative-prompt-builder) and normalization rules
// (premium-narrative-formatter) as full generation, so the two flows can
// never drift apart. The cover is not regenerable — it is synthesized from
// known facts, never AI-authored.
import Anthropic from "@anthropic-ai/sdk"
import { env } from "@/lib/env"
import { emitEvent } from "@/lib/events"
import { resolveTone } from "./tone.service"
import { buildPremiumSystemPrompt, buildSectionRegenerationPrompt } from "./premium-narrative-prompt-builder.service"
import { parsePremiumSectionResponse } from "./premium-narrative-formatter.service"
import { mapSectionResultToPayload } from "@/services/premium-narrative-mapper.service"
import type { ProposalGenerationInput } from "@/types/proposal-generation"
import type { PremiumNarrativeKind, PremiumNarrativeSectionPayload } from "@/types/proposal-premium-narrative"
import type { BrandingContext } from "./generation.service"

const MODEL      = "claude-haiku-4-5-20251001"
const MAX_TOKENS = 3000 // one section, not twelve

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey })
  return _client
}

export interface RegeneratedSection {
  payload:    PremiumNarrativeSectionPayload
  tokensUsed: number
}

export const premiumSectionRegenerationService = {
  async regenerate(
    input:     ProposalGenerationInput,
    kind:      Exclude<PremiumNarrativeKind, "cover">,
    branding?: BrandingContext,
  ): Promise<RegeneratedSection> {
    const tone         = resolveTone(input)
    const systemPrompt = buildPremiumSystemPrompt(tone, branding)
    const userPrompt   = buildSectionRegenerationPrompt(input, tone, kind)

    const message = await getClient().messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    })

    const content = message.content[0]
    if (content.type !== "text") throw new Error("Unexpected AI response type")

    const result  = parsePremiumSectionResponse(kind, content.text)
    const payload = mapSectionResultToPayload(result)

    const tokensUsed = message.usage.input_tokens + message.usage.output_tokens
    emitEvent("proposal.premium_section_regenerated", {
      tokensUsed,
      outputTokens: message.usage.output_tokens,
      model:        MODEL,
      tone,
      sectionKind:  kind,
    })

    return { payload, tokensUsed }
  },
}
