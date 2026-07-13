// Single-call Haiku generation for the 12-page premium narrative (Fase A).
// Parallel to generation.service.ts — the legacy PremiumProposal flow keeps
// working untouched. If real-world output_tokens usage (instrumented below)
// regularly approaches MAX_TOKENS, the documented fallback is splitting into
// two sequential calls (welcome→scope / process→closing) — a mechanical
// change confined to this file, since the output contract is a flat keyed
// object.
import Anthropic from "@anthropic-ai/sdk"
import { env } from "@/lib/env"
import { emitEvent } from "@/lib/events"
import { resolveTone } from "./tone.service"
import { buildPremiumSystemPrompt, buildPremiumUserPrompt } from "./premium-narrative-prompt-builder.service"
import { parsePremiumNarrativeResponse } from "./premium-narrative-formatter.service"
import type { ProposalGenerationInput } from "@/types/proposal-generation"
import type { PremiumNarrativeGenerationResult } from "@/types/proposal-premium-narrative"
import type { BrandingContext } from "./generation.service"

const MODEL      = "claude-haiku-4-5-20251001"
const MAX_TOKENS = 12000

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey })
  return _client
}

export const premiumNarrativeGenerationService = {
  async generate(
    input:     ProposalGenerationInput,
    branding?: BrandingContext,
  ): Promise<PremiumNarrativeGenerationResult> {
    const tone         = resolveTone(input)
    const systemPrompt = buildPremiumSystemPrompt(tone, branding)
    const userPrompt   = buildPremiumUserPrompt(input, tone)

    const message = await getClient().messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    })

    const content = message.content[0]
    if (content.type !== "text") throw new Error("Unexpected AI response type")

    const output = parsePremiumNarrativeResponse(content.text)

    const tokensUsed = message.usage.input_tokens + message.usage.output_tokens
    // outputTokens instrumented separately so real-world truncation headroom
    // vs MAX_TOKENS is measurable from day one, not assumed.
    emitEvent("proposal.premium_narrative_generated", {
      tokensUsed,
      outputTokens: message.usage.output_tokens,
      model:        MODEL,
      tone,
    })

    return { output, tone, model: MODEL, tokensUsed }
  },
}
