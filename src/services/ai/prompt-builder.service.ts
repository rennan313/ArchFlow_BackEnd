import type { ProposalGenerationInput, ProposalTone } from "@/types/proposal-generation"
import { TONE_PERSONAS, TONE_OPENING_STYLE } from "./tone.service"

const COMPLEXITY_LABELS: Record<string, string> = {
  LOW:     "baixa complexidade",
  MEDIUM:  "complexidade média",
  HIGH:    "alta complexidade",
  PREMIUM: "complexidade premium — projeto de alto padrão",
}

const PRICING_METHOD_LABELS: Record<string, string> = {
  HOURLY:      "por hora técnica",
  SQUARE_METER: "por metro quadrado",
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function line(label: string, value: string | number | undefined) {
  if (!value) return ""
  return `• ${label}: ${value}`
}

export function buildSystemPrompt(tone: ProposalTone): string {
  return `${TONE_PERSONAS[tone].trim()}

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

export function buildUserPrompt(input: ProposalGenerationInput, tone: ProposalTone): string {
  const today    = new Date()
  const validity = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const fmt      = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })

  const location = [input.city, input.state].filter(Boolean).join(", ") || "localização não informada"

  const pricingContext = (() => {
    if (!input.pricingMethod && !input.estimatedValue) return ""
    const parts: string[] = []
    if (input.pricingMethod) parts.push(`Método de precificação: ${PRICING_METHOD_LABELS[input.pricingMethod]}`)
    if (input.estimatedValue && input.estimatedValue > 0) parts.push(`Valor estimado do projeto: ${formatCurrency(input.estimatedValue)}`)
    if (input.complexity) parts.push(`Nível do projeto: ${COMPLEXITY_LABELS[input.complexity] ?? input.complexity}`)
    return parts.join("\n")
  })()

  const briefing = [
    line("Objetivo principal",    input.projectObjective),
    line("Uso do espaço",         input.spaceUsage),
    line("Problemas atuais",      input.currentProblems),
    line("Prioridades do cliente", input.priorities),
    line("Prazo desejado",        input.timeline),
    line("Referência de orçamento", input.budget),
  ].filter(Boolean).join("\n")

  const outputSchema = `
{
  "cover": {
    "proposalTitle": "título formal e sofisticado da proposta",
    "proposalSubtitle": "subtítulo descritivo e elegante",
    "clientName": "${input.clientName}",
    "projectType": "${input.projectType}",
    "location": "${location}",
    "date": "${fmt(today)}",
    "validUntil": "${fmt(validity)}"
  },
  "summary": "resumo executivo em 2-3 parágrafos — apresenta o projeto com visão estratégica e emocional. ${TONE_OPENING_STYLE[tone]}",
  "clientUnderstanding": "1-2 parágrafos demonstrando que o escritório compreendeu profundamente as necessidades, desejos e contexto do cliente. Específico, não genérico.",
  "architecturalDirection": "2-3 parágrafos descrevendo o conceito arquitetônico, partido adotado, referências estéticas e filosóficas do projeto. Tom autoral e sofisticado.",
  "objectives": [
    { "title": "título conciso do objetivo", "description": "descrição detalhada de 1-2 frases" }
  ],
  "scope": [
    { "item": "nome do serviço/entregável", "description": "descrição clara do que está incluído" }
  ],
  "excludedItems": ["item não incluso 1", "item não incluso 2"],
  "stages": [
    {
      "number": 1,
      "name": "nome da fase",
      "duration": "X semanas",
      "description": "descrição da fase em 1-2 frases",
      "deliverables": ["entregável 1", "entregável 2"]
    }
  ],
  "timeline": [
    { "phase": "nome da fase", "duration": "X semanas", "description": "o que acontece nessa fase", "milestone": "marco ou entrega principal" }
  ],
  "investment": {
    "method": "descrição do método de precificação adotado",
    "estimatedValue": "${input.estimatedValue ? formatCurrency(input.estimatedValue) : "A confirmar conforme escopo definitivo"}",
    "paymentStructure": ["30% na assinatura do contrato", "40% na entrega do anteprojeto", "30% na entrega do projeto executivo"],
    "validity": "Esta proposta é válida por 30 dias a partir da data de apresentação",
    "notes": "observações sobre o investimento, flexibilidade, condições especiais"
  },
  "differentials": [
    { "title": "título do diferencial", "description": "como esse diferencial beneficia especificamente este projeto" }
  ],
  "risks": [
    { "risk": "descrição do risco identificado", "mitigation": "como será mitigado", "severity": "low|medium|high" }
  ],
  "finalConsiderations": "2-3 parágrafos de fechamento — reforça o compromisso do escritório, convida o cliente para o próximo passo, transmite confiança e entusiasmo pelo projeto"
}`

  return `Gere uma proposta comercial PREMIUM e PERSONALIZADA para o seguinte projeto de arquitetura.

━━━ DADOS DO PROJETO ━━━
${line("Cliente", input.clientName)}
${line("Tipo de projeto", input.projectType)}
${line("Localização", location)}
${input.squareMeters ? line("Área total", `${input.squareMeters} m²`) : ""}
${input.style ? line("Estilo arquitetônico", input.style) : ""}

${briefing ? `━━━ BRIEFING DO CLIENTE ━━━\n${briefing}` : ""}

${input.meetingNotes ? `━━━ NOTAS DA REUNIÃO ━━━\n${input.meetingNotes}` : ""}

${pricingContext ? `━━━ PRECIFICAÇÃO ━━━\n${pricingContext}` : ""}

━━━ INSTRUÇÕES DE GERAÇÃO ━━━
${TONE_OPENING_STYLE[tone]}
• Gere entre 4 e 6 objetivos específicos para este projeto
• Gere entre 6 e 8 itens de escopo detalhados
• Gere entre 3 e 5 itens excluídos do escopo (seja específico)
• Gere exatamente 4-5 fases do projeto com deliverables
• Gere entre 4 e 6 diferenciais específicos para este tipo de projeto
• Identifique entre 2 e 4 riscos realistas com suas mitigações
• O campo "summary" deve ter no mínimo 3 parágrafos ricos

Retorne APENAS o JSON abaixo, preenchido completamente:
${outputSchema}`
}
