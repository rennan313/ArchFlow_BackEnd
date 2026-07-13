// Pure mapping functions for the premium-narrative initialize() branch:
// AI output + known proposal facts → 12 discriminated section payloads, in
// the fixed narrative order, plus the plaintext summaries stored in
// ProposalSectionInstance.content as the search/generic-render fallback.
import {
  PROCESS_STEP_NAMES,
  NEXT_STEP_NAMES,
  DELIVERABLE_LABELS,
  type PremiumNarrativeAiOutput,
  type PremiumNarrativeCover,
  type PremiumNarrativeSectionPayload,
} from "@/types/proposal-premium-narrative"

interface CoverSourceProposal {
  clientName: string
  projectType: string
  city: string | null
  state: string | null
  createdAt: Date
}

interface CoverSourceProject {
  name: string
}

interface CoverSourceBranding {
  logoUrl: string | null
}

interface CoverSourceMedia {
  id: string
  type: string
  order: number
}

export function synthesizeCover(
  proposal: CoverSourceProposal,
  project:  CoverSourceProject | null,
  branding: CoverSourceBranding | null,
  media:    CoverSourceMedia[],
): PremiumNarrativeCover {
  const location = [proposal.city, proposal.state].filter(Boolean).join(", ") || "Localização não informada"
  const heroImage = media
    .filter((m) => m.type === "IMAGE")
    .sort((a, b) => a.order - b.order)[0]

  return {
    kind:          "cover",
    clientName:    proposal.clientName,
    projectName:   project?.name ?? `${proposal.projectType} — ${proposal.clientName}`,
    projectType:   proposal.projectType,
    location,
    heroMediaId:   heroImage?.id ?? null,
    officeLogoUrl: branding?.logoUrl ?? null,
    date:          proposal.createdAt.toISOString(),
  }
}

/** AI output + synthesized cover → the 12 payloads, fixed narrative order. */
export function mapAiOutputToPayloads(
  output: PremiumNarrativeAiOutput,
  cover:  PremiumNarrativeCover,
): PremiumNarrativeSectionPayload[] {
  return [
    cover,
    { kind: "welcome", ...output.welcome },
    { kind: "client-understanding", ...output.clientUnderstanding },
    { kind: "solution", ...output.solution },
    { kind: "scope", ...output.scope },
    {
      kind:  "process",
      title: "Como Funciona Nosso Processo",
      steps: PROCESS_STEP_NAMES.map((name, i) => ({
        order:       i + 1,
        name,
        description: output.process[name] || "Etapa detalhada em reunião de alinhamento.",
      })),
    },
    { kind: "schedule", ...output.schedule },
    {
      kind:  "deliverables",
      title: "Entregáveis",
      items: DELIVERABLE_LABELS.map((label) => ({
        label,
        included: output.deliverables[label]?.included ?? true,
        note:     output.deliverables[label]?.note,
      })),
    },
    { kind: "investment", ...output.investment },
    { kind: "exclusions", ...output.exclusions },
    {
      kind:  "next-steps",
      title: "Próximos Passos",
      steps: NEXT_STEP_NAMES.map((name, i) => ({
        order:       i + 1,
        name,
        description: output.nextSteps[name] || undefined,
      })),
    },
    { kind: "closing", ...output.closing },
  ]
}

export function payloadTitle(payload: PremiumNarrativeSectionPayload): string {
  if (payload.kind === "cover") return "Capa"
  return payload.title
}

/** Plaintext summary for ProposalSectionInstance.content — the fallback text
 *  used by search and by the generic renderers when metadata isn't parsed. */
export function plainTextSummaryFor(payload: PremiumNarrativeSectionPayload): string {
  switch (payload.kind) {
    case "cover":
      return [payload.projectName, payload.clientName, payload.location].filter(Boolean).join("\n")
    case "welcome":
    case "closing":
      return payload.message
    case "client-understanding":
      return [
        payload.narrative,
        ...payload.facts.map((f) => `• ${f.label}: ${f.value}`),
      ].filter(Boolean).join("\n")
    case "solution":
      return payload.narrative
    case "scope":
      return payload.items.map((i) => `• ${i.name}: ${i.description}\n  Benefício: ${i.benefit}`).join("\n")
    case "process":
      return payload.steps.map((s) => `${s.order}. ${s.name} — ${s.description}`).join("\n")
    case "schedule":
      return [
        payload.totalDuration ? `Duração total: ${payload.totalDuration}` : "",
        ...payload.items.map((i) => `• ${i.phase} (${i.duration}): ${i.description}`),
      ].filter(Boolean).join("\n")
    case "deliverables":
      return payload.items
        .map((i) => `${i.included ? "✓" : "✗"} ${i.label}${i.note ? ` — ${i.note}` : ""}`)
        .join("\n")
    case "investment":
      return [
        `Valor: ${payload.value}`,
        payload.downPayment ? `Entrada: ${payload.downPayment}` : "",
        "Condições:",
        ...payload.installments.map((c) => `• ${c}`),
        "",
        payload.valueJustificationText,
      ].filter(Boolean).join("\n")
    case "exclusions":
      return payload.items.map((i) => `• ${i}`).join("\n")
    case "next-steps":
      return payload.steps.map((s) => `${s.order}. ${s.name}${s.description ? ` — ${s.description}` : ""}`).join("\n")
  }
}
