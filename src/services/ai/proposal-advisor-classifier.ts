import type { ProjectClassification, ProjectTypeCategory, InvestmentTier, NarrativeProfile, ProposalSkinValue } from "@/types/proposal-advisor"

const RETAIL_KEYWORDS    = ["loja", "varejo", "retail", "showroom", "ponto de venda"]
const CORPORATE_KEYWORDS = ["corporativo", "sede", "matriz", "escritório corporativo", "headquarters"]

const COMPACT_MAX_SQM  = 70
const STANDARD_MAX_SQM = 200

/** Deterministic, rule-based — no LLM. Mirrors the Complexity enum already
 *  curated by the architect on the Proposal, only relabeled to the advisor's
 *  4-tier vocabulary (MEDIUM -> MID). Falls back to contract value only when
 *  no complexity has been set yet. */
function classifyInvestmentTier(input: {
  complexity: string | null
  contractValue: number | null
}): InvestmentTier {
  switch (input.complexity) {
    case "PREMIUM": return "PREMIUM"
    case "HIGH":    return "HIGH"
    case "MEDIUM":  return "MID"
    case "LOW":     return "LOW"
  }

  const value = input.contractValue
  if (value == null) return "MID"
  if (value < 20_000)  return "LOW"
  if (value < 60_000)  return "MID"
  if (value < 150_000) return "HIGH"
  return "PREMIUM"
}

function classifyProjectTypeCategory(input: {
  projectType: string
  squareMeters: number | null
  investmentTier: InvestmentTier
  signalText: string
}): ProjectTypeCategory {
  switch (input.projectType) {
    case "INTERIOR":   return "INTERIOR_DESIGN"
    case "RENOVATION":  return "RETROFIT"
    case "URBAN":
    case "LANDSCAPE":   return "CUSTOM"

    case "COMMERCIAL": {
      if (RETAIL_KEYWORDS.some((k) => input.signalText.includes(k)))    return "RETAIL"
      if (CORPORATE_KEYWORDS.some((k) => input.signalText.includes(k))) return "CORPORATE"
      return "COMMERCIAL"
    }

    case "RESIDENTIAL": {
      if (input.investmentTier === "PREMIUM") return "RESIDENTIAL_PREMIUM"
      const sqm = input.squareMeters
      if (sqm == null)            return "RESIDENTIAL_STANDARD"
      if (sqm <= COMPACT_MAX_SQM)  return "RESIDENTIAL_COMPACT"
      if (sqm <= STANDARD_MAX_SQM) return "RESIDENTIAL_STANDARD"
      return "RESIDENTIAL_PREMIUM"
    }

    default: return "CUSTOM"
  }
}

const BASE_NARRATIVE_BY_CATEGORY: Record<ProjectTypeCategory, NarrativeProfile> = {
  CORPORATE:             "CORPORATE",
  COMMERCIAL:            "INSTITUTIONAL",
  RETAIL:                "INSTITUTIONAL",
  INTERIOR_DESIGN:       "EMOTIONAL",
  RESIDENTIAL_PREMIUM:   "PREMIUM",
  RESIDENTIAL_STANDARD:  "CONSULTIVE",
  RESIDENTIAL_COMPACT:   "CONSULTIVE",
  RETROFIT:              "CONSULTIVE",
  CUSTOM:                "CONSULTIVE",
}

const RESIDENTIAL_CATEGORIES = new Set<ProjectTypeCategory>([
  "RESIDENTIAL_COMPACT", "RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM", "RETROFIT", "CUSTOM",
])

function classifyNarrativeProfile(category: ProjectTypeCategory, investmentTier: InvestmentTier): NarrativeProfile {
  const base = BASE_NARRATIVE_BY_CATEGORY[category]
  // Top-tier investment on a residential-flavored project earns the premium
  // narrative regardless of size — but corporate/commercial/retail clients
  // keep their institutional voice even at high budgets, since that's a
  // brand-positioning choice, not a spending-tier one.
  if (investmentTier === "PREMIUM" && RESIDENTIAL_CATEGORIES.has(category) && base !== "PREMIUM") {
    return "PREMIUM"
  }
  return base
}

/** Maps a narrative profile to the closest ProposalSkin value. Visual choice
 *  is otherwise independent of the scoring engine — skins are PDF treatments,
 *  not block content, so there's nothing to score per-block here. */
export function recommendSkin(narrativeProfile: NarrativeProfile, category: ProjectTypeCategory, investmentTier: InvestmentTier): ProposalSkinValue {
  switch (narrativeProfile) {
    case "CORPORATE":
    case "INSTITUTIONAL": return "CORPORATE"
    case "EMOTIONAL":      return "EDITORIAL"
    case "CONSULTIVE":     return "MINIMAL"
    case "PREMIUM":
      return category === "RESIDENTIAL_PREMIUM" && investmentTier === "PREMIUM" ? "LUXURY" : "PREMIUM"
  }
}

export interface ClassifyProjectInput {
  projectType: string
  squareMeters: number | null
  complexity: string | null
  contractValue: number | null
  signalText: string
}

export function classifyProject(input: ClassifyProjectInput): ProjectClassification {
  const investmentTier = classifyInvestmentTier(input)
  const projectTypeCategory = classifyProjectTypeCategory({ ...input, investmentTier })
  const narrativeProfile = classifyNarrativeProfile(projectTypeCategory, investmentTier)

  return { projectTypeCategory, investmentTier, narrativeProfile, signalText: input.signalText }
}
