// Defensive parser/normalizer for the premium-narrative AI response — same
// philosophy as proposal-formatter.service.ts: a partially malformed Haiku
// response degrades to safe fallbacks, never throws past the initial
// "no JSON at all" case.
import {
  PREMIUM_NARRATIVE_SCHEMA_VERSION,
  PROCESS_STEP_NAMES,
  NEXT_STEP_NAMES,
  DELIVERABLE_LABELS,
  type PremiumNarrativeAiOutput,
  type ClientUnderstandingFact,
} from "@/types/proposal-premium-narrative"

export function parsePremiumNarrativeResponse(raw: string): PremiumNarrativeAiOutput {
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

  return normalizeOutput(parsed as Record<string, unknown>)
}

// ─── Helpers (same conventions as proposal-formatter.service.ts) ─────────────

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

function arr<T>(v: unknown, mapper: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v.map(mapper).filter((x): x is T => x !== null && x !== undefined)
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

const FACT_LABELS = new Set(["objectives", "needs", "preferences", "constraints", "budget", "timeline"])

// ─── Normalizer ──────────────────────────────────────────────────────────────

function normalizeOutput(p: Record<string, unknown>): PremiumNarrativeAiOutput {
  const welcome  = rec(p.welcome)
  const cu       = rec(p.clientUnderstanding)
  const solution = rec(p.solution)
  const scope    = rec(p.scope)
  const schedule = rec(p.schedule)
  const inv      = rec(p.investment)
  const excl     = rec(p.exclusions)
  const closing  = rec(p.closing)

  // process / nextSteps: keyed maps against the fixed skeletons. Only accept
  // the known step names; anything the model invented is dropped, and any
  // step it skipped falls back to "" (the payload mapper fills a placeholder).
  const processRaw = rec(p.process)
  const process: Record<string, string> = {}
  for (const name of PROCESS_STEP_NAMES) process[name] = str(processRaw[name])

  const nextStepsRaw = rec(p.nextSteps)
  const nextSteps: Record<string, string> = {}
  for (const name of NEXT_STEP_NAMES) nextSteps[name] = str(nextStepsRaw[name])

  const deliverablesRaw = rec(p.deliverables)
  const deliverables: Record<string, { included: boolean; note?: string }> = {}
  for (const label of DELIVERABLE_LABELS) {
    const d = rec(deliverablesRaw[label])
    deliverables[label] = {
      included: typeof d.included === "boolean" ? d.included : true,
      note:     optStr(d.note),
    }
  }

  return {
    schemaVersion: PREMIUM_NARRATIVE_SCHEMA_VERSION,

    welcome: {
      title:   str(welcome.title, "Bem-vindo"),
      message: str(welcome.message),
    },

    clientUnderstanding: {
      title:     str(cu.title, "O Que Entendemos do Seu Projeto"),
      narrative: str(cu.narrative),
      facts: arr<ClientUnderstandingFact>(cu.facts, (item) => {
        const f     = rec(item)
        const label = str(f.label)
        const value = str(f.value)
        if (!FACT_LABELS.has(label) || !value) return null
        return { label: label as ClientUnderstandingFact["label"], value }
      }),
    },

    solution: {
      title:     str(solution.title, "Nossa Solução"),
      narrative: str(solution.narrative),
    },

    scope: {
      title: str(scope.title, "Escopo de Serviços"),
      items: arr(scope.items, (item) => {
        const s    = rec(item)
        const name = str(s.name)
        if (!name) return null
        return { name, description: str(s.description), benefit: str(s.benefit) }
      }),
    },

    process,

    schedule: {
      title:         str(schedule.title, "Cronograma"),
      totalDuration: optStr(schedule.totalDuration),
      items: arr(schedule.items, (item) => {
        const t     = rec(item)
        const phase = str(t.phase)
        if (!phase) return null
        return {
          phase,
          duration:         str(t.duration),
          description:      str(t.description),
          revisions:        optStr(t.revisions),
          expectedDelivery: optStr(t.expectedDelivery),
        }
      }),
    },

    deliverables,

    investment: {
      title:                  str(inv.title, "Investimento"),
      value:                  str(inv.value, "A confirmar"),
      downPayment:            optStr(inv.downPayment),
      installments: arr(inv.installments, (x) =>
        typeof x === "string" && x.trim() ? x.trim() : null,
      ) as string[],
      valueJustificationText: str(inv.valueJustificationText),
    },

    exclusions: {
      title: str(excl.title, "O Que Não Está Incluído"),
      items: arr(excl.items, (x) =>
        typeof x === "string" && x.trim() ? x.trim() : null,
      ) as string[],
    },

    nextSteps,

    closing: {
      title:   str(closing.title, "Vamos Começar?"),
      message: str(closing.message),
    },
  }
}
