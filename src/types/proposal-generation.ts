// ─── Input ────────────────────────────────────────────────────────────────────

export interface ProposalGenerationInput {
  clientName:        string
  city?:             string
  state?:            string
  projectType:       string
  squareMeters?:     number
  style?:            string
  projectObjective?: string
  spaceUsage?:       string
  currentProblems?:  string
  priorities?:       string
  budget?:           string
  timeline?:         string
  meetingNotes?:     string
  pricingMethod?:    "HOURLY" | "SQUARE_METER"
  estimatedValue?:   number
  complexity?:       "LOW" | "MEDIUM" | "HIGH" | "PREMIUM"
}

export type ProposalTone = "residential" | "commercial" | "luxury" | "interiors" | "landscape"

// ─── Section types ────────────────────────────────────────────────────────────

export interface ProposalCover {
  title:       string
  subtitle:    string
  projectType: string
  city:        string
  style:       string
}

export interface ProposalSection {
  title:   string
  content: string
}

export interface ProposalObjective {
  title:       string
  description: string
}

export interface ProposalScopeItem {
  item:        string
  description: string
}

export interface ProposalScope {
  included: ProposalScopeItem[]
  excluded: string[]
}

export interface ProposalStage {
  number:       number
  name:         string
  duration:     string
  description:  string
  deliverables: string[]
}

export interface ProposalTimelineItem {
  phase:       string
  duration:    string
  description: string
  milestone?:  string
}

export interface ProposalInvestment {
  pricingMethod:     string
  estimatedValue:    string
  paymentConditions: string[]
}

export interface ProposalDifferential {
  title:       string
  description: string
}

export interface ProposalRisk {
  risk:       string
  mitigation: string
  severity:   "low" | "medium" | "high"
}

// ─── Full proposal ────────────────────────────────────────────────────────────

export interface PremiumProposal {
  cover:                  ProposalCover
  summary:                ProposalSection
  clientUnderstanding:    ProposalSection
  architecturalDirection: ProposalSection
  objectives:             ProposalObjective[]
  scope:                  ProposalScope
  stages:                 ProposalStage[]
  timeline:               ProposalTimelineItem[]
  investment:             ProposalInvestment
  differentials:          ProposalDifferential[]
  risks:                  ProposalRisk[]
  finalConsiderations:    ProposalSection
}

export interface GenerationResult {
  proposal:    PremiumProposal
  tone:        ProposalTone
  model:       string
  tokensUsed?: number
}
