// Defensive parser/normalizer for the premium-narrative AI response — same
// philosophy as proposal-formatter.service.ts: a partially malformed Haiku
// response degrades to safe fallbacks, never throws past the initial
// "no JSON at all" case.
//
// Fase B: normalization is decomposed per-section so the single-section
// regeneration flow reuses the exact same coercion rules as full generation.
import {
  PREMIUM_NARRATIVE_SCHEMA_VERSION,
  PROCESS_STEP_NAMES,
  NEXT_STEP_NAMES,
  DELIVERABLE_LABELS,
  type PremiumNarrativeAiOutput,
  type PremiumNarrativeKind,
  type ClientUnderstandingFact,
} from "@/types/proposal-premium-narrative"

function extractJson(raw: string): Record<string, unknown> {
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "")
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("AI returned no valid JSON object")
    return JSON.parse(match[0]) as Record<string, unknown>
  }
}

export function parsePremiumNarrativeResponse(raw: string): PremiumNarrativeAiOutput {
  return normalizeOutput(extractJson(raw))
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

// ─── Per-section normalizers ──────────────────────────────────────────────────

function normalizeWelcome(v: unknown): PremiumNarrativeAiOutput["welcome"] {
  const o = rec(v)
  return { title: str(o.title, "Bem-vindo"), message: str(o.message) }
}

function normalizeClientUnderstanding(v: unknown): PremiumNarrativeAiOutput["clientUnderstanding"] {
  const o = rec(v)
  return {
    title:     str(o.title, "O Que Entendemos do Seu Projeto"),
    narrative: str(o.narrative),
    facts: arr<ClientUnderstandingFact>(o.facts, (item) => {
      const f     = rec(item)
      const label = str(f.label)
      const value = str(f.value)
      if (!FACT_LABELS.has(label) || !value) return null
      return { label: label as ClientUnderstandingFact["label"], value }
    }),
  }
}

function normalizeSolution(v: unknown): PremiumNarrativeAiOutput["solution"] {
  const o = rec(v)
  return { title: str(o.title, "Nossa Solução"), narrative: str(o.narrative) }
}

function normalizeScope(v: unknown): PremiumNarrativeAiOutput["scope"] {
  const o = rec(v)
  return {
    title: str(o.title, "Escopo de Serviços"),
    items: arr(o.items, (item) => {
      const s    = rec(item)
      const name = str(s.name)
      if (!name) return null
      return { name, description: str(s.description), benefit: str(s.benefit) }
    }),
  }
}

function normalizeProcess(v: unknown): PremiumNarrativeAiOutput["process"] {
  const o = rec(v)
  const process: Record<string, string> = {}
  for (const name of PROCESS_STEP_NAMES) process[name] = str(o[name])
  return process
}

function normalizeSchedule(v: unknown): PremiumNarrativeAiOutput["schedule"] {
  const o = rec(v)
  return {
    title:         str(o.title, "Cronograma"),
    totalDuration: optStr(o.totalDuration),
    items: arr(o.items, (item) => {
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
  }
}

function normalizeDeliverables(v: unknown): PremiumNarrativeAiOutput["deliverables"] {
  const o = rec(v)
  const deliverables: Record<string, { included: boolean; note?: string }> = {}
  for (const label of DELIVERABLE_LABELS) {
    const d = rec(o[label])
    deliverables[label] = {
      included: typeof d.included === "boolean" ? d.included : true,
      note:     optStr(d.note),
    }
  }
  return deliverables
}

function normalizeInvestment(v: unknown): PremiumNarrativeAiOutput["investment"] {
  const o = rec(v)
  return {
    title:                  str(o.title, "Investimento"),
    value:                  str(o.value, "A confirmar"),
    downPayment:            optStr(o.downPayment),
    installments: arr(o.installments, (x) =>
      typeof x === "string" && x.trim() ? x.trim() : null,
    ) as string[],
    valueJustificationText: str(o.valueJustificationText),
  }
}

function normalizeExclusions(v: unknown): PremiumNarrativeAiOutput["exclusions"] {
  const o = rec(v)
  return {
    title: str(o.title, "O Que Não Está Incluído"),
    items: arr(o.items, (x) =>
      typeof x === "string" && x.trim() ? x.trim() : null,
    ) as string[],
  }
}

function normalizeNextSteps(v: unknown): PremiumNarrativeAiOutput["nextSteps"] {
  const o = rec(v)
  const nextSteps: Record<string, string> = {}
  for (const name of NEXT_STEP_NAMES) nextSteps[name] = str(o[name])
  return nextSteps
}

function normalizeClosing(v: unknown): PremiumNarrativeAiOutput["closing"] {
  const o = rec(v)
  return { title: str(o.title, "Vamos Começar?"), message: str(o.message) }
}

// ─── Full-output normalizer (Fase A flow) ─────────────────────────────────────

function normalizeOutput(p: Record<string, unknown>): PremiumNarrativeAiOutput {
  return {
    schemaVersion:       PREMIUM_NARRATIVE_SCHEMA_VERSION,
    welcome:             normalizeWelcome(p.welcome),
    clientUnderstanding: normalizeClientUnderstanding(p.clientUnderstanding),
    solution:            normalizeSolution(p.solution),
    scope:               normalizeScope(p.scope),
    process:             normalizeProcess(p.process),
    schedule:            normalizeSchedule(p.schedule),
    deliverables:        normalizeDeliverables(p.deliverables),
    investment:          normalizeInvestment(p.investment),
    exclusions:          normalizeExclusions(p.exclusions),
    nextSteps:           normalizeNextSteps(p.nextSteps),
    closing:             normalizeClosing(p.closing),
  }
}

// ─── Single-section parsing (Fase B regeneration) ─────────────────────────────

export type PremiumSectionAiResult =
  | { kind: "welcome";              data: PremiumNarrativeAiOutput["welcome"] }
  | { kind: "client-understanding"; data: PremiumNarrativeAiOutput["clientUnderstanding"] }
  | { kind: "solution";             data: PremiumNarrativeAiOutput["solution"] }
  | { kind: "scope";                data: PremiumNarrativeAiOutput["scope"] }
  | { kind: "process";              data: PremiumNarrativeAiOutput["process"] }
  | { kind: "schedule";             data: PremiumNarrativeAiOutput["schedule"] }
  | { kind: "deliverables";         data: PremiumNarrativeAiOutput["deliverables"] }
  | { kind: "investment";           data: PremiumNarrativeAiOutput["investment"] }
  | { kind: "exclusions";           data: PremiumNarrativeAiOutput["exclusions"] }
  | { kind: "next-steps";           data: PremiumNarrativeAiOutput["nextSteps"] }
  | { kind: "closing";              data: PremiumNarrativeAiOutput["closing"] }

export function parsePremiumSectionResponse(
  kind: Exclude<PremiumNarrativeKind, "cover">,
  raw:  string,
): PremiumSectionAiResult {
  const parsed = extractJson(raw)
  switch (kind) {
    case "welcome":              return { kind, data: normalizeWelcome(parsed) }
    case "client-understanding": return { kind, data: normalizeClientUnderstanding(parsed) }
    case "solution":             return { kind, data: normalizeSolution(parsed) }
    case "scope":                return { kind, data: normalizeScope(parsed) }
    case "process":              return { kind, data: normalizeProcess(parsed) }
    case "schedule":             return { kind, data: normalizeSchedule(parsed) }
    case "deliverables":         return { kind, data: normalizeDeliverables(parsed) }
    case "investment":           return { kind, data: normalizeInvestment(parsed) }
    case "exclusions":           return { kind, data: normalizeExclusions(parsed) }
    case "next-steps":           return { kind, data: normalizeNextSteps(parsed) }
    case "closing":              return { kind, data: normalizeClosing(parsed) }
  }
}
