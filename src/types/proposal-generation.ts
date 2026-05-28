// ─── Input ────────────────────────────────────────────────────────────────────

export interface ProposalGenerationInput {
  // Client & project
  clientName:       string
  city?:            string
  state?:           string
  projectType:      string
  squareMeters?:    number
  style?:           string
  // Briefing
  projectObjective?: string
  spaceUsage?:       string
  currentProblems?:  string
  priorities?:       string
  budget?:           string
  timeline?:         string
  meetingNotes?:     string
  // Pricing context
  pricingMethod?:   "HOURLY" | "SQUARE_METER"
  estimatedValue?:  number
  complexity?:      "LOW" | "MEDIUM" | "HIGH" | "PREMIUM"
}

export type ProposalTone = "residential" | "commercial" | "luxury" | "interiors" | "landscape"

// ─── Output sections ──────────────────────────────────────────────────────────

export interface ProposalCover {
  proposalTitle:    string
  proposalSubtitle: string
  clientName:       string
  projectType:      string
  location:         string
  date:             string
  validUntil:       string
}

export interface ProposalObjective {
  title:       string
  description: string
}

export interface ProposalScopeItem {
  item:        string
  description: string
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
  method:           string
  estimatedValue:   string
  paymentStructure: string[]
  validity:         string
  notes:            string
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

// ─── Full premium proposal ────────────────────────────────────────────────────

export interface PremiumProposal {
  cover:                  ProposalCover
  summary:                string
  clientUnderstanding:    string
  architecturalDirection: string
  objectives:             ProposalObjective[]
  scope:                  ProposalScopeItem[]
  excludedItems:          string[]
  stages:                 ProposalStage[]
  timeline:               ProposalTimelineItem[]
  investment:             ProposalInvestment
  differentials:          ProposalDifferential[]
  risks:                  ProposalRisk[]
  finalConsiderations:    string
}

export interface GenerationResult {
  proposal:    PremiumProposal
  tone:        ProposalTone
  model:       string
  tokensUsed?: number
}
