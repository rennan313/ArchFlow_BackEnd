// ─── Advisor classification taxonomy ───────────────────────────────────────
// Distinct from ProposalNarrative.toneKey (the 5 AI-prose personas in
// tone.service.ts) and from ProposalSkin (the 5 PDF visual treatments).
// These axes exist purely to drive the deterministic scoring engine in
// proposal-advisor-scoring.ts — no LLM involved in Phase 1.

export const PROJECT_TYPE_CATEGORIES = [
  "RESIDENTIAL_COMPACT",
  "RESIDENTIAL_STANDARD",
  "RESIDENTIAL_PREMIUM",
  "INTERIOR_DESIGN",
  "COMMERCIAL",
  "CORPORATE",
  "RETAIL",
  "RETROFIT",
  "CUSTOM",
] as const
export type ProjectTypeCategory = (typeof PROJECT_TYPE_CATEGORIES)[number]

export const INVESTMENT_TIERS = ["LOW", "MID", "HIGH", "PREMIUM"] as const
export type InvestmentTier = (typeof INVESTMENT_TIERS)[number]

export const NARRATIVE_PROFILES = ["CONSULTIVE", "PREMIUM", "CORPORATE", "EMOTIONAL", "INSTITUTIONAL"] as const
export type NarrativeProfile = (typeof NARRATIVE_PROFILES)[number]

// Mirrors the Prisma ProposalSkin enum — duplicated as a literal union here
// (rather than imported from @prisma/client) so this file stays a plain
// types module with no runtime dependency on the generated client.
export const PROPOSAL_SKINS = [
  "EDITORIAL", "MINIMAL", "PREMIUM", "CORPORATE", "LUXURY",
  "ENTERPRISE_LIGHT", "ENTERPRISE_DARK", "PREMIUM_GOLD", "CORPORATE_EXECUTIVE",
] as const
export type ProposalSkinValue = (typeof PROPOSAL_SKINS)[number]

export interface ProjectClassification {
  projectTypeCategory: ProjectTypeCategory
  investmentTier: InvestmentTier
  narrativeProfile: NarrativeProfile
  signalText: string // lowercased free text gathered from briefing/notes, used for keyword scoring
}

export interface RecommendedBlock {
  blockId: string
  name: string
  score: number
}

export interface ProposalAdviceResult {
  recommendedTemplateId: string | null
  recommendedTemplate: string | null
  recommendedSkin: ProposalSkinValue
  recommendedNarrative: NarrativeProfile
  recommendedSections: string[]
  recommendedBlocks: Record<string, RecommendedBlock>
  reasoning: string[]
  confidence: number
  classification: {
    projectTypeCategory: ProjectTypeCategory
    investmentTier: InvestmentTier
  }
}
