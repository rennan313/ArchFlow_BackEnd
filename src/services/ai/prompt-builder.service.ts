import type { ProposalGenerationInput, ProposalTone } from "@/types/proposal-generation"
import { TONE_PERSONAS, TONE_OPENING_STYLE } from "./tone.service"
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

// Sanitize user input before injecting into AI prompt
// Prevents prompt injection attacks via meetingNotes / briefing fields
function sanitize(text: string | undefined | null, maxLen = 3000): string {
  if (!text) return ""
  return text
    .slice(0, maxLen)
    .replace(/```/g, "'''")           // prevent markdown code-fence breakout
    .replace(/\bignore\b.{0,80}\binstructions?\b/gi, "[filtrado]")
    .replace(/\bsystem\b.{0,20}\bprompt\b/gi, "[filtrado]")
    .trim()
}

export function buildSystemPrompt(tone: ProposalTone, branding?: BrandingContext): string {
  const brandingSection = branding ? buildBrandingContext(branding) : ""

  return `${TONE_PERSONAS[tone].trim()}
${brandingSection}
REGRAS ABSOLUTAS:
- Escreva em português do Brasil, com linguagem culta e fluente
- NUNCA use markdown (sem **, sem #, sem -)
- NUNCA use listas com bullets no texto corrido — incorpore ao texto
- NUNCA gere texto genérico ou de template
- NUNCA repita informações entre seções
- Cada seção deve ser independente, específica e personalizada
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
  if (b.proposalSignature)              lines.push(`\nAssinatura da proposta:\n${b.proposalSignature}`)
  if (b.proposalFooter)                 lines.push(`\nRodapé da proposta:\n${b.proposalFooter}`)
  lines.push("")
  return lines.join("\n")
}

export function buildUserPrompt(input: ProposalGenerationInput, tone: ProposalTone): string {
  const city     = input.city  ?? "não informada"
  const style    = input.style ?? "Contemporâneo"
  const location = [input.city, input.state].filter(Boolean).join(", ") || "localização não informada"

  const pricingContext = (() => {
    const parts: string[] = []
    if (input.pricingMethod)  parts.push(`Método: ${PRICING_METHOD_LABELS[input.pricingMethod]}`)
    if (input.estimatedValue) parts.push(`Valor estimado: ${formatCurrency(input.estimatedValue)}`)
    if (input.complexity)     parts.push(`Nível: ${COMPLEXITY_LABELS[input.complexity] ?? input.complexity}`)
    return parts.join("\n")
  })()

  // Sanitize all free-text inputs to prevent prompt injection
  const briefing = [
    line("Objetivo principal",      sanitize(input.projectObjective, 500)),
    line("Uso do espaço",           sanitize(input.spaceUsage, 500)),
    line("Problemas atuais",        sanitize(input.currentProblems, 500)),
    line("Prioridades do cliente",  sanitize(input.priorities, 500)),
    line("Prazo desejado",          sanitize(input.timeline, 200)),
    line("Referência de orçamento", sanitize(input.budget, 200)),
  ].filter(Boolean).join("\n")

  const estimatedValueStr = input.estimatedValue
    ? formatCurrency(input.estimatedValue)
    : "A confirmar conforme escopo definitivo"

  const pricingMethodStr = input.pricingMethod
    ? PRICING_METHOD_LABELS[input.pricingMethod]
    : "A definir com o cliente"

  const outputSchema = `{
  "cover": {
    "title": "título formal e sofisticado da proposta",
    "subtitle": "subtítulo descritivo e elegante — 1 frase",
    "projectType": "${input.projectType}",
    "city": "${city}",
    "style": "${style}"
  },
  "summary": {
    "title": "título da seção (ex: Visão Geral do Projeto)",
    "content": "resumo executivo em 3 parágrafos — visão estratégica e emocional do projeto. ${TONE_OPENING_STYLE[tone]}"
  },
  "clientUnderstanding": {
    "title": "título da seção (ex: Entendimento das Suas Necessidades)",
    "content": "2 parágrafos demonstrando compreensão profunda do contexto, desejos e necessidades do cliente. Específico para este projeto."
  },
  "architecturalDirection": {
    "title": "título da seção (ex: Direção Arquitetônica)",
    "content": "2-3 parágrafos sobre o conceito arquitetônico, partido adotado e filosofia do projeto. Tom autoral e sofisticado."
  },
  "objectives": [
    { "title": "título conciso do objetivo", "description": "1-2 frases específicas para este projeto" }
  ],
  "scope": {
    "included": [
      { "item": "nome do serviço ou entregável", "description": "o que exatamente está incluído" }
    ],
    "excluded": ["serviço não incluso 1", "serviço não incluso 2"]
  },
  "stages": [
    {
      "number": 1,
      "name": "nome da fase",
      "duration": "X semanas",
      "description": "descrição objetiva da fase em 1-2 frases",
      "deliverables": ["entregável 1", "entregável 2", "entregável 3"]
    }
  ],
  "timeline": [
    {
      "phase": "nome da fase",
      "duration": "X semanas",
      "description": "o que acontece nessa fase",
      "milestone": "marco ou entrega principal desta fase"
    }
  ],
  "investment": {
    "pricingMethod": "${pricingMethodStr}",
    "estimatedValue": "${estimatedValueStr}",
    "paymentConditions": [
      "30% na assinatura do contrato",
      "40% na entrega do anteprojeto aprovado",
      "30% na entrega do projeto executivo"
    ]
  },
  "differentials": [
    { "title": "nome do diferencial", "description": "como beneficia especificamente este projeto" }
  ],
  "risks": [
    { "risk": "risco identificado", "mitigation": "como será mitigado ou gerenciado", "severity": "low|medium|high" }
  ],
  "finalConsiderations": {
    "title": "título da seção (ex: Próximos Passos)",
    "content": "2-3 parágrafos de fechamento — compromisso do escritório, convite ao próximo passo, confiança e entusiasmo pelo projeto"
  }
}`

  const visualRefsLine = input.visualRefUrls?.length
    ? `• Referências visuais: ${input.visualRefUrls.length} imagem(ns)/vídeo(s) fornecido(s) pelo cliente como inspiração — integre essa riqueza visual à narrativa`
    : ""

  return `Gere uma proposta comercial PREMIUM e PERSONALIZADA para o projeto abaixo.

━━━ DADOS DO PROJETO ━━━
${line("Cliente",             input.clientName)}
${line("Tipo de projeto",     input.projectType)}
${line("Localização",         location)}
${input.squareMeters ? line("Área total", `${input.squareMeters} m²`) : ""}
${input.style ? line("Estilo arquitetônico", input.style) : ""}
${visualRefsLine}

${briefing ? `━━━ BRIEFING DO CLIENTE ━━━\n${briefing}` : ""}

${input.meetingNotes ? `━━━ NOTAS DA REUNIÃO ━━━\n${sanitize(input.meetingNotes, 3000)}` : ""}

${pricingContext ? `━━━ PRECIFICAÇÃO ━━━\n${pricingContext}` : ""}

━━━ INSTRUÇÕES DE GERAÇÃO ━━━
${TONE_OPENING_STYLE[tone]}
• Gere entre 4 e 6 objetivos específicos para este projeto
• Gere entre 5 e 8 itens incluídos no escopo com descrição
• Gere entre 3 e 5 itens excluídos do escopo (seja específico ao tipo de projeto)
• Gere exatamente 4 ou 5 fases com deliverables realistas
• Gere entre 4 e 6 diferenciais específicos para este tipo de projeto e estilo
• Identifique entre 2 e 4 riscos realistas e suas mitigações concretas
• summary.content deve ter exatamente 3 parágrafos
• architecturalDirection.content deve mencionar o estilo "${style}" e a cidade "${city}"

Retorne APENAS o seguinte JSON, completamente preenchido:
${outputSchema}`
}
