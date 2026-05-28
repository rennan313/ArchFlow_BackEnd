import type { PremiumProposal } from "@/types/proposal-generation"

export function parseAIResponse(raw: string): PremiumProposal {
  let text = raw.trim()

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "")

  // Attempt direct parse
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Try to extract JSON object from response
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("AI returned no valid JSON object")
    parsed = JSON.parse(match[0])
  }

  return normalizeProposal(parsed as Record<string, unknown>)
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

function arr<T>(v: unknown, mapper: (item: unknown) => T): T[] {
  if (!Array.isArray(v)) return []
  return v.map(mapper).filter((x): x is T => x !== null && x !== undefined)
}

function normalizeProposal(p: Record<string, unknown>): PremiumProposal {
  const cover = (p.cover ?? {}) as Record<string, unknown>

  return {
    cover: {
      proposalTitle:    str(cover.proposalTitle,    "Proposta Técnica e Comercial"),
      proposalSubtitle: str(cover.proposalSubtitle, "Projeto de Arquitetura"),
      clientName:       str(cover.clientName),
      projectType:      str(cover.projectType),
      location:         str(cover.location),
      date:             str(cover.date),
      validUntil:       str(cover.validUntil),
    },

    summary:                str(p.summary),
    clientUnderstanding:    str(p.clientUnderstanding),
    architecturalDirection: str(p.architecturalDirection),

    objectives: arr(p.objectives, (item) => {
      const o = item as Record<string, unknown>
      return { title: str(o.title), description: str(o.description) }
    }),

    scope: arr(p.scope, (item) => {
      const s = item as Record<string, unknown>
      return { item: str(s.item), description: str(s.description) }
    }),

    excludedItems: arr(p.excludedItems, (item) => (typeof item === "string" ? item : null))
      .filter(Boolean) as string[],

    stages: arr(p.stages, (item) => {
      const s = item as Record<string, unknown>
      return {
        number:       typeof s.number === "number" ? s.number : 1,
        name:         str(s.name),
        duration:     str(s.duration),
        description:  str(s.description),
        deliverables: arr(s.deliverables, (d) => (typeof d === "string" ? d : null))
          .filter(Boolean) as string[],
      }
    }),

    timeline: arr(p.timeline, (item) => {
      const t = item as Record<string, unknown>
      return {
        phase:       str(t.phase),
        duration:    str(t.duration),
        description: str(t.description),
        milestone:   str(t.milestone) || undefined,
      }
    }),

    investment: (() => {
      const inv = (p.investment ?? {}) as Record<string, unknown>
      return {
        method:           str(inv.method),
        estimatedValue:   str(inv.estimatedValue,  "A definir"),
        paymentStructure: arr(inv.paymentStructure, (x) => (typeof x === "string" ? x : null))
          .filter(Boolean) as string[],
        validity:         str(inv.validity),
        notes:            str(inv.notes),
      }
    })(),

    differentials: arr(p.differentials, (item) => {
      const d = item as Record<string, unknown>
      return { title: str(d.title), description: str(d.description) }
    }),

    risks: arr(p.risks, (item) => {
      const r   = item as Record<string, unknown>
      const sev = str(r.severity)
      return {
        risk:       str(r.risk),
        mitigation: str(r.mitigation),
        severity:   (["low", "medium", "high"].includes(sev) ? sev : "medium") as "low" | "medium" | "high",
      }
    }),

    finalConsiderations: str(p.finalConsiderations),
  }
}
