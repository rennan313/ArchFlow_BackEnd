import type { PremiumProposal, ProposalSection } from "@/types/proposal-generation"

export function parseAIResponse(raw: string): PremiumProposal {
  let text = raw.trim()

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "")

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("AI returned no valid JSON object")
    parsed = JSON.parse(match[0])
  }

  return normalizeProposal(parsed as Record<string, unknown>)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

function arr<T>(v: unknown, mapper: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v.map(mapper).filter((x): x is T => x !== null && x !== undefined)
}

function section(v: unknown, defaultTitle: string): ProposalSection {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return { title: str(o.title, defaultTitle), content: str(o.content) }
  }
  // Backwards-compat: if AI returned a plain string
  return { title: defaultTitle, content: str(v) }
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeProposal(p: Record<string, unknown>): PremiumProposal {
  const cover = (p.cover ?? {}) as Record<string, unknown>
  const scope = (p.scope ?? {}) as Record<string, unknown>
  const inv   = (p.investment ?? {}) as Record<string, unknown>

  return {
    // Cover
    cover: {
      title:       str(cover.title,       "Proposta Técnica e Comercial"),
      subtitle:    str(cover.subtitle,    "Projeto de Arquitetura Personalizado"),
      projectType: str(cover.projectType),
      city:        str(cover.city),
      style:       str(cover.style),
    },

    // Text sections — support both { title, content } and plain string
    summary:                section(p.summary,                "Visão Geral do Projeto"),
    clientUnderstanding:    section(p.clientUnderstanding,    "Entendimento das Suas Necessidades"),
    architecturalDirection: section(p.architecturalDirection, "Direção Arquitetônica"),
    finalConsiderations:    section(p.finalConsiderations,    "Próximos Passos"),

    // Objectives
    objectives: arr(p.objectives, (item) => {
      const o = item as Record<string, unknown>
      const title       = str(o.title)
      const description = str(o.description)
      if (!title && !description) return null
      return { title, description }
    }),

    // Scope — { included[], excluded[] }
    scope: {
      included: arr(scope.included, (item) => {
        const s = item as Record<string, unknown>
        const it   = str(s.item)
        const desc = str(s.description)
        if (!it) return null
        return { item: it, description: desc }
      }),
      excluded: arr(scope.excluded, (item) =>
        typeof item === "string" && item.trim() ? item.trim() : null,
      ) as string[],
    },

    // Stages
    stages: arr(p.stages, (item) => {
      const s = item as Record<string, unknown>
      const name = str(s.name)
      if (!name) return null
      return {
        number:       typeof s.number === "number" ? s.number : 1,
        name,
        duration:     str(s.duration),
        description:  str(s.description),
        deliverables: arr(s.deliverables, (d) =>
          typeof d === "string" && d.trim() ? d.trim() : null,
        ) as string[],
      }
    }),

    // Timeline
    timeline: arr(p.timeline, (item) => {
      const t = item as Record<string, unknown>
      const phase = str(t.phase)
      if (!phase) return null
      return {
        phase,
        duration:    str(t.duration),
        description: str(t.description),
        milestone:   str(t.milestone) || undefined,
      }
    }),

    // Investment
    investment: {
      pricingMethod:     str(inv.pricingMethod,     "A definir"),
      estimatedValue:    str(inv.estimatedValue,    "A confirmar"),
      paymentConditions: arr(inv.paymentConditions, (x) =>
        typeof x === "string" && x.trim() ? x.trim() : null,
      ) as string[],
    },

    // Differentials
    differentials: arr(p.differentials, (item) => {
      const d = item as Record<string, unknown>
      const title = str(d.title)
      if (!title) return null
      return { title, description: str(d.description) }
    }),

    // Risks
    risks: arr(p.risks, (item) => {
      const r   = item as Record<string, unknown>
      const risk = str(r.risk)
      if (!risk) return null
      const sev = str(r.severity)
      return {
        risk,
        mitigation: str(r.mitigation),
        severity:   (["low", "medium", "high"].includes(sev) ? sev : "medium") as "low" | "medium" | "high",
      }
    }),
  }
}
