import Anthropic from "@anthropic-ai/sdk"
import { env } from "@/lib/env"
import { emitEvent } from "@/lib/events"
import { resolveTone } from "./tone.service"
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder.service"
import { parseAIResponse } from "./proposal-formatter.service"
import type { ProposalGenerationInput, GenerationResult, LibraryContext } from "@/types/proposal-generation"

const MODEL      = "claude-haiku-4-5-20251001"
const MAX_TOKENS = 8000

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey })
  return _client
}

export interface BrandingContext {
  officeName?:        string | null
  tradeName?:         string | null
  architectName?:     string | null
  cauNumber?:         string | null
  email?:             string | null
  phone?:             string | null
  logoUrl?:           string | null
  proposalSignature?: string | null
  proposalFooter?:    string | null
  primaryColor?:      string | null
}

export const generationService = {
  async generate(
    input:    ProposalGenerationInput,
    branding?: BrandingContext,
    library?: LibraryContext,
  ): Promise<GenerationResult> {
    const tone         = resolveTone(input)
    const systemPrompt = buildSystemPrompt(tone, branding)
    const userPrompt   = buildUserPrompt(input, tone, library)

    const message = await getClient().messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    })

    const content = message.content[0]
    if (content.type !== "text") throw new Error("Unexpected AI response type")

    const proposal = parseAIResponse(content.text)

    const tokensUsed = message.usage.input_tokens + message.usage.output_tokens
    emitEvent("proposal.ai_generated", { tokensUsed, model: MODEL, tone })

    return {
      proposal,
      tone,
      model:   MODEL,
      tokensUsed,
    }
  },
}
