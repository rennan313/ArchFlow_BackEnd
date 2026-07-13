// ─── Premium Narrative (Fase A — Proposal Experience v2) ─────────────────────
// The fixed 12-page premium sales narrative. Each page's structured payload is
// JSON-stringified into ProposalSectionInstance.metadata; `content` keeps a
// plaintext summary as the fallback for search and for the generic renderers.
//
// NOTE: this file is mirrored by hand at ArchFlow/src/types/
// proposal-premium-narrative.ts — same convention as ProposalSkinValue
// (see proposal-render-model.ts). Keep both in sync.

export const PREMIUM_NARRATIVE_SCHEMA_VERSION = "premium-narrative-v1"

export type PremiumNarrativeKind =
  | "cover"
  | "welcome"
  | "client-understanding"
  | "solution"
  | "scope"
  | "process"
  | "schedule"
  | "deliverables"
  | "investment"
  | "exclusions"
  | "next-steps"
  | "closing"

/** Catalog keys, in fixed narrative order. Index = sortOrder. */
export const PREMIUM_NARRATIVE_SECTION_KEYS = [
  "premium-cover",
  "premium-welcome",
  "premium-client-understanding",
  "premium-solution",
  "premium-scope",
  "premium-process",
  "premium-schedule",
  "premium-deliverables",
  "premium-investment",
  "premium-exclusions",
  "premium-next-steps",
  "premium-closing",
] as const

export type PremiumNarrativeSectionKey = (typeof PREMIUM_NARRATIVE_SECTION_KEYS)[number]

export const PREMIUM_KEY_TO_KIND: Record<PremiumNarrativeSectionKey, PremiumNarrativeKind> = {
  "premium-cover":                "cover",
  "premium-welcome":              "welcome",
  "premium-client-understanding": "client-understanding",
  "premium-solution":             "solution",
  "premium-scope":                "scope",
  "premium-process":              "process",
  "premium-schedule":             "schedule",
  "premium-deliverables":         "deliverables",
  "premium-investment":           "investment",
  "premium-exclusions":           "exclusions",
  "premium-next-steps":           "next-steps",
  "premium-closing":              "closing",
}

// Fixed skeletons — the AI only writes short per-step descriptions; names and
// order are guaranteed by code, never by the model. Changing these requires a
// deploy (accepted for Fase A; first candidate to become data in a future
// customization phase).
export const PROCESS_STEP_NAMES = [
  "Briefing",
  "Levantamento",
  "Estudo Preliminar",
  "Anteprojeto",
  "Projeto Executivo",
  "Entrega",
] as const

export const NEXT_STEP_NAMES = [
  "Aprovação",
  "Contrato",
  "Pagamento",
  "Agendamento",
  "Início do Projeto",
] as const

export const DELIVERABLE_LABELS = [
  "Planta Baixa",
  "Cortes",
  "Fachadas",
  "Projeto Executivo",
  "Memorial Descritivo",
  "Modelagem 3D",
  "Renderizações",
  "Arquivos PDF",
] as const

// ─── Per-page payloads ───────────────────────────────────────────────────────

export interface PremiumNarrativeCover {
  kind: "cover"
  clientName: string
  projectName: string
  projectType: string
  location: string
  /** ProposalMedia.id — the signed URL is resolved at render time, never baked in. */
  heroMediaId: string | null
  officeLogoUrl: string | null
  /** ISO date */
  date: string
}

export interface PremiumNarrativeWelcome {
  kind: "welcome"
  title: string
  message: string
}

export interface ClientUnderstandingFact {
  label: "objectives" | "needs" | "preferences" | "constraints" | "budget" | "timeline"
  value: string
}

export interface PremiumNarrativeClientUnderstanding {
  kind: "client-understanding"
  title: string
  narrative: string
  facts: ClientUnderstandingFact[]
}

export interface PremiumNarrativeSolution {
  kind: "solution"
  title: string
  narrative: string
}

export interface ScopeServiceItem {
  name: string
  description: string
  benefit: string
}

export interface PremiumNarrativeScope {
  kind: "scope"
  title: string
  items: ScopeServiceItem[]
}

export interface ProcessStep {
  order: number
  name: string
  description: string
}

export interface PremiumNarrativeProcess {
  kind: "process"
  title: string
  steps: ProcessStep[]
}

export interface ScheduleItem {
  phase: string
  duration: string
  description: string
  revisions?: string
  expectedDelivery?: string
}

export interface PremiumNarrativeSchedule {
  kind: "schedule"
  title: string
  totalDuration?: string
  items: ScheduleItem[]
}

export interface DeliverableItem {
  label: string
  included: boolean
  note?: string
}

export interface PremiumNarrativeDeliverables {
  kind: "deliverables"
  title: string
  items: DeliverableItem[]
}

export interface PremiumNarrativeInvestment {
  kind: "investment"
  title: string
  value: string
  downPayment?: string
  installments: string[]
  valueJustificationText: string
}

export interface PremiumNarrativeExclusions {
  kind: "exclusions"
  title: string
  items: string[]
}

export interface NextStep {
  order: number
  name: string
  description?: string
}

export interface PremiumNarrativeNextSteps {
  kind: "next-steps"
  title: string
  steps: NextStep[]
}

export interface PremiumNarrativeClosing {
  kind: "closing"
  title: string
  message: string
}

export type PremiumNarrativeSectionPayload =
  | PremiumNarrativeCover
  | PremiumNarrativeWelcome
  | PremiumNarrativeClientUnderstanding
  | PremiumNarrativeSolution
  | PremiumNarrativeScope
  | PremiumNarrativeProcess
  | PremiumNarrativeSchedule
  | PremiumNarrativeDeliverables
  | PremiumNarrativeInvestment
  | PremiumNarrativeExclusions
  | PremiumNarrativeNextSteps
  | PremiumNarrativeClosing

// ─── AI output contract ──────────────────────────────────────────────────────
// 11 keys — the cover is synthesized programmatically from known facts, never
// AI-authored. process/nextSteps/deliverables are keyed maps against the fixed
// skeleton names above, so the model only fills in short strings.

export interface PremiumNarrativeAiOutput {
  schemaVersion: typeof PREMIUM_NARRATIVE_SCHEMA_VERSION
  welcome:             Omit<PremiumNarrativeWelcome, "kind">
  clientUnderstanding: Omit<PremiumNarrativeClientUnderstanding, "kind">
  solution:            Omit<PremiumNarrativeSolution, "kind">
  scope:               Omit<PremiumNarrativeScope, "kind">
  process:             Record<string, string>
  schedule:            Omit<PremiumNarrativeSchedule, "kind">
  deliverables:        Record<string, { included: boolean; note?: string }>
  investment:          Omit<PremiumNarrativeInvestment, "kind">
  exclusions:          Omit<PremiumNarrativeExclusions, "kind">
  nextSteps:           Record<string, string>
  closing:             Omit<PremiumNarrativeClosing, "kind">
}

export interface PremiumNarrativeGenerationResult {
  output:      PremiumNarrativeAiOutput
  tone:        string
  model:       string
  tokensUsed?: number
}

// ─── Lenient parsers ─────────────────────────────────────────────────────────
// Any parse or shape failure returns null — the caller falls back to the
// generic (pre-Fase-A) rendering/editing path, never throws.

const VALID_KINDS = new Set<string>([
  "cover", "welcome", "client-understanding", "solution", "scope", "process",
  "schedule", "deliverables", "investment", "exclusions", "next-steps", "closing",
])

export function parsePremiumNarrativePayload(raw: string | null | undefined): PremiumNarrativeSectionPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown }
    if (typeof parsed !== "object" || parsed === null) return null
    if (typeof parsed.kind !== "string" || !VALID_KINDS.has(parsed.kind)) return null
    return parsed as PremiumNarrativeSectionPayload
  } catch {
    return null
  }
}

/** Detects the new-format generatedText blob written by the premium route. */
export function tryParsePremiumNarrativeOutput(raw: string | null | undefined): PremiumNarrativeAiOutput | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown }
    if (typeof parsed !== "object" || parsed === null) return null
    if (parsed.schemaVersion !== PREMIUM_NARRATIVE_SCHEMA_VERSION) return null
    return parsed as PremiumNarrativeAiOutput
  } catch {
    return null
  }
}
