// Prompt builder for the fixed 12-page premium sales narrative (Fase A).
// Parallel to prompt-builder.service.ts (legacy PremiumProposal flow) — the
// two coexist; this one produces the PremiumNarrativeAiOutput contract where
// the cover is NEVER AI-authored and process/next-steps/deliverables are
// keyed maps against fixed skeletons injected literally into the prompt.
//
// Fase B: the output schema is decomposed into per-section fragments so the
// single-section regeneration flow reuses the exact same shared context and
// schema text as full generation — the two can never drift apart.
import type { ProposalGenerationInput, ProposalTone } from "@/types/proposal-generation"
import {
  PROCESS_STEP_NAMES,
  NEXT_STEP_NAMES,
  DELIVERABLE_LABELS,
  type PremiumNarrativeKind,
} from "@/types/proposal-premium-narrative"
import { TONE_PERSONAS, TONE_OPENING_STYLE } from "./tone.service"
import { sanitize } from "./sanitize"
import type { BrandingContext } from "./generation.service"

const COMPLEXITY_LABELS: Record<string, string> = {
  LOW:     "baixa complexidade",
  MEDIUM:  "complexidade média",
  HIGH:    "alta complexidade",
  PREMIUM: "complexidade premium — projeto de alto padrão",
}

const PRICING_METHOD_LABELS: Record<string, string> = {
  HOURLY:       "por hora técnica",
  SQUARE_METER: "por metro quadrado",
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function line(label: string, value: string | number | undefined): string {
  if (!value) return ""
  return `• ${label}: ${value}`
}

export function buildPremiumSystemPrompt(tone: ProposalTone, branding?: BrandingContext): string {
  const brandingSection = branding ? buildBrandingContext(branding) : ""

  return `${TONE_PERSONAS[tone].trim()}
${brandingSection}
REGRAS ABSOLUTAS:
- Escreva em português do Brasil, com linguagem culta e fluente
- NUNCA use markdown (sem **, sem #, sem -)
- NUNCA gere texto genérico ou de template — tudo deve ser específico para ESTE cliente e ESTE projeto
- Parágrafos CURTOS: 2 a 4 frases cada. Textos escaneáveis, nunca blocos longos
- NUNCA repita informações entre seções
- Para "process" e "nextSteps": use EXATAMENTE os nomes de etapa fornecidos como chaves — nunca invente, renomeie ou reordene etapas
- Para "deliverables": use EXATAMENTE os rótulos fornecidos como chaves
- Retorne EXCLUSIVAMENTE JSON válido, sem nenhum texto fora do JSON
- Não inclua comentários dentro do JSON`
}

function buildBrandingContext(b: BrandingContext): string {
  const lines: string[] = ["\n━━━ IDENTIDADE DO ESCRITÓRIO ━━━"]
  if (b.officeName    || b.tradeName)   lines.push(`Escritório: ${b.tradeName ?? b.officeName}`)
  if (b.architectName)                  lines.push(`Responsável técnico: ${b.architectName}`)
  if (b.cauNumber)                      lines.push(`CAU: ${b.cauNumber}`)
  if (b.email)                          lines.push(`E-mail profissional: ${b.email}`)
  if (b.phone)                          lines.push(`Telefone: ${b.phone}`)
  lines.push("")
  return lines.join("\n")
}

// ─── Shared project context (generation AND per-section regeneration) ────────

export function buildSharedProjectContext(input: ProposalGenerationInput, tone: ProposalTone): string {
  const clientName     = sanitize(input.clientName, 200)
  const projectType    = sanitize(input.projectType, 100)
  const sanitizedCity  = sanitize(input.city ?? "não informada", 100)
  const sanitizedStyle = sanitize(input.style ?? "Contemporâneo", 100)
  const sanitizedState = sanitize(input.state ?? "", 100)
  const location = [sanitizedCity, sanitizedState].filter(Boolean).join(", ") || "localização não informada"

  const pricingContext = (() => {
    const parts: string[] = []
    if (input.pricingMethod)  parts.push(`Método: ${PRICING_METHOD_LABELS[input.pricingMethod]}`)
    if (input.estimatedValue) parts.push(`Valor estimado: ${formatCurrency(input.estimatedValue)}`)
    if (input.complexity)     parts.push(`Nível: ${COMPLEXITY_LABELS[input.complexity] ?? input.complexity}`)
    return parts.join("\n")
  })()

  const briefing = [
    line("Objetivo principal",      sanitize(input.projectObjective, 500)),
    line("Uso do espaço",           sanitize(input.spaceUsage, 500)),
    line("Problemas atuais",        sanitize(input.currentProblems, 500)),
    line("Prioridades do cliente",  sanitize(input.priorities, 500)),
    line("Prazo desejado",          sanitize(input.timeline, 200)),
    line("Referência de orçamento", sanitize(input.budget, 200)),
  ].filter(Boolean).join("\n")

  return `━━━ DADOS DO PROJETO ━━━
${line("Cliente",             clientName)}
${line("Tipo de projeto",     projectType)}
${line("Localização",         location)}
${input.squareMeters ? line("Área total", `${input.squareMeters} m²`) : ""}
${input.style ? line("Estilo arquitetônico", sanitizedStyle) : ""}

${briefing ? `━━━ BRIEFING DO CLIENTE ━━━\n${briefing}` : ""}

${input.meetingNotes ? `━━━ NOTAS DA REUNIÃO ━━━\n${sanitize(input.meetingNotes, 3000)}` : ""}

${pricingContext ? `━━━ PRECIFICAÇÃO ━━━\n${pricingContext}` : ""}

━━━ INSTRUÇÕES DE GERAÇÃO ━━━
${TONE_OPENING_STYLE[tone]}`
}

// ─── Per-section output-schema fragments ──────────────────────────────────────
// Keyed by the AI-output key. Cover is deliberately absent — synthesized in
// code, never AI-authored.

function estimatedValueStr(input: ProposalGenerationInput): string {
  return input.estimatedValue
    ? formatCurrency(input.estimatedValue)
    : "A confirmar conforme escopo definitivo"
}

export const SECTION_SCHEMA_FRAGMENTS: Record<Exclude<PremiumNarrativeKind, "cover">, (input: ProposalGenerationInput) => string> = {
  "welcome": () => `{
    "title": "título curto da página de boas-vindas (ex: Bem-vindo)",
    "message": "mensagem humanizada de boas-vindas em 2 parágrafos curtos — agradeça a oportunidade, mencione o briefing compartilhado e demonstre entusiasmo genuíno por este projeto específico"
  }`,
  "client-understanding": () => `{
    "title": "título da página (ex: O Que Entendemos do Seu Projeto)",
    "narrative": "2 parágrafos curtos demonstrando que o escritório OUVIU o cliente — específico, nunca genérico",
    "facts": [
      { "label": "objectives",  "value": "objetivos do cliente extraídos do briefing" },
      { "label": "needs",       "value": "necessidades identificadas" },
      { "label": "preferences", "value": "preferências de estilo/uso" },
      { "label": "constraints", "value": "restrições relevantes" },
      { "label": "budget",      "value": "referência de orçamento informada" },
      { "label": "timeline",    "value": "prazo esperado" }
    ]
  }`,
  "solution": () => `{
    "title": "título da página (ex: Nossa Solução)",
    "narrative": "3 parágrafos curtos explicando COMO o escritório vai resolver os desafios apresentados — benefícios concretos para o cliente, não lista de serviços"
  }`,
  "scope": () => `{
    "title": "título da página (ex: Escopo de Serviços)",
    "items": [
      { "name": "nome do serviço", "description": "descrição técnica objetiva (1-2 frases)", "benefit": "benefício concreto para o cliente (ex: reduz erros na obra e evita retrabalho)" }
    ]
  }`,
  "process": () => `{
${PROCESS_STEP_NAMES.map((n) => `    "${n}": "descrição curta desta etapa (1-2 frases)"`).join(",\n")}
  }`,
  "schedule": () => `{
    "title": "título da página (ex: Cronograma)",
    "totalDuration": "duração total estimada (ex: 16 semanas)",
    "items": [
      { "phase": "nome da fase", "duration": "X semanas", "description": "o que acontece", "revisions": "rodadas de revisão inclusas", "expectedDelivery": "entrega prevista desta fase" }
    ]
  }`,
  "deliverables": () => `{
${DELIVERABLE_LABELS.map((l) => `    "${l}": { "included": true, "note": "observação opcional curta" }`).join(",\n")}
  }`,
  "investment": (input) => `{
    "title": "título da página (ex: Investimento)",
    "value": "${estimatedValueStr(input)}",
    "downPayment": "entrada sugerida (ex: 30% na assinatura)",
    "installments": [
      "30% na assinatura do contrato",
      "40% na entrega do anteprojeto aprovado",
      "30% na entrega do projeto executivo"
    ],
    "valueJustificationText": "2 parágrafos curtos explicando o valor agregado deste investimento — o que o cliente ganha, riscos que evita, valorização que obtém. Nunca apenas números."
  }`,
  "exclusions": () => `{
    "title": "título da página (ex: O Que Não Está Incluído)",
    "items": ["item não incluso 1", "item não incluso 2"]
  }`,
  "next-steps": () => `{
${NEXT_STEP_NAMES.map((n) => `    "${n}": "descrição curta desta etapa (1 frase)"`).join(",\n")}
  }`,
  "closing": () => `{
    "title": "título da página (ex: Vamos Começar?)",
    "message": "mensagem final em 2 parágrafos curtos — compromisso do escritório, convite claro à aprovação, confiança e entusiasmo"
  }`,
}

/** Maps the section kind to the AI-output object key used in full generation. */
export const KIND_TO_OUTPUT_KEY: Record<Exclude<PremiumNarrativeKind, "cover">, string> = {
  "welcome":              "welcome",
  "client-understanding": "clientUnderstanding",
  "solution":             "solution",
  "scope":                "scope",
  "process":              "process",
  "schedule":             "schedule",
  "deliverables":         "deliverables",
  "investment":           "investment",
  "exclusions":           "exclusions",
  "next-steps":           "nextSteps",
  "closing":              "closing",
}

const GENERATION_GUIDELINES = `• Gere entre 4 e 7 itens de escopo, cada um com benefício CONCRETO para o cliente
• Gere entre 4 e 6 fases no cronograma, coerentes com o processo de 6 etapas
• Gere entre 3 e 5 itens não inclusos (específicos ao tipo de projeto — evita conflitos futuros)
• clientUnderstanding.facts: preencha os 6 labels usando o briefing; se uma informação não foi fornecida, escreva "Não informado — a alinhar em reunião"
• Linguagem profissional, clara e personalizada — nunca genérica`

// ─── Full-document prompt (Fase A flow, unchanged composition) ────────────────

export function buildPremiumUserPrompt(input: ProposalGenerationInput, tone: ProposalTone): string {
  const f = SECTION_SCHEMA_FRAGMENTS
  const outputSchema = `{
  "welcome": ${f["welcome"](input).trim()},
  "clientUnderstanding": ${f["client-understanding"](input).trim()},
  "solution": ${f["solution"](input).trim()},
  "scope": ${f["scope"](input).trim()},
  "process": ${f["process"](input).trim()},
  "schedule": ${f["schedule"](input).trim()},
  "deliverables": ${f["deliverables"](input).trim()},
  "investment": ${f["investment"](input).trim()},
  "exclusions": ${f["exclusions"](input).trim()},
  "nextSteps": ${f["next-steps"](input).trim()},
  "closing": ${f["closing"](input).trim()}
}`

  return `Gere o conteúdo de uma proposta comercial PREMIUM de 12 páginas para o projeto abaixo.
Esta proposta conduz o cliente por uma jornada de venda — cada página aumenta a confiança antes de apresentar o investimento.

${buildSharedProjectContext(input, tone)}
${GENERATION_GUIDELINES}

Retorne APENAS o seguinte JSON, completamente preenchido:
${outputSchema}`
}

// ─── Single-section regeneration prompt (Fase B) ──────────────────────────────

export function buildSectionRegenerationPrompt(
  input: ProposalGenerationInput,
  tone:  ProposalTone,
  kind:  Exclude<PremiumNarrativeKind, "cover">,
): string {
  const fragment = SECTION_SCHEMA_FRAGMENTS[kind](input)

  return `Regenere UMA seção específica de uma proposta comercial premium de arquitetura.
A seção deve ser nova e específica para este cliente — não um texto genérico.

${buildSharedProjectContext(input, tone)}
• Linguagem profissional, clara e personalizada — nunca genérica

Retorne APENAS o seguinte JSON, completamente preenchido:
${fragment}`
}
