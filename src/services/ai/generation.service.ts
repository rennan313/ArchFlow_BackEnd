import Anthropic from "@anthropic-ai/sdk"
import { resolveTone } from "./tone.service"
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder.service"
import { parseAIResponse } from "./proposal-formatter.service"
import type { ProposalGenerationInput, GenerationResult } from "@/types/proposal-generation"

const MODEL        = "claude-haiku-4-5-20251001"
const MAX_TOKENS   = 8000

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set")
    _client = new Anthropic({ apiKey: key })
  }
  return _client
}

export const generationService = {
  async generate(input: ProposalGenerationInput): Promise<GenerationResult> {
    const tone         = resolveTone(input)
    const systemPrompt = buildSystemPrompt(tone)
    const userPrompt   = buildUserPrompt(input, tone)

    const client  = getClient()
    const message = await client.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    })

    const content = message.content[0]
    if (content.type !== "text") throw new Error("Unexpected AI response type")

    const proposal = parseAIResponse(content.text)

    return {
      proposal,
      tone,
      model:      MODEL,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    }
  },
}
