import { z } from "zod"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const WorkspaceTypeEnum = z.enum([
  "INDIVIDUAL",
  "SMALL_OFFICE",
  "GROWING_OFFICE",
  "LARGE_OFFICE",
])

export const TeamSizeEnum = z.enum([
  "SOLO",
  "TWO_TO_FIVE",
  "FIVE_TO_FIFTEEN",
  "FIFTEEN_PLUS",
])

export const PrimaryGoalEnum = z.enum([
  "PROPOSAL_GENERATION",
  "CLIENT_PRESENTATION",
  "BRIEFING_ORGANIZATION",
  "PRICING_WORKFLOW",
  "VISUAL_REFERENCES",
])

// ─── Labels (for frontend display) ────────────────────────────────────────────

export const WORKSPACE_TYPE_LABELS: Record<z.infer<typeof WorkspaceTypeEnum>, string> = {
  INDIVIDUAL:    "Profissional autônomo",
  SMALL_OFFICE:  "Escritório pequeno (2–5 pessoas)",
  GROWING_OFFICE: "Escritório em crescimento (6–15)",
  LARGE_OFFICE:  "Escritório grande (15+)",
}

export const TEAM_SIZE_LABELS: Record<z.infer<typeof TeamSizeEnum>, string> = {
  SOLO:          "Só eu",
  TWO_TO_FIVE:   "2 a 5 pessoas",
  FIVE_TO_FIFTEEN: "5 a 15 pessoas",
  FIFTEEN_PLUS:  "Mais de 15 pessoas",
}

export const PRIMARY_GOAL_LABELS: Record<z.infer<typeof PrimaryGoalEnum>, string> = {
  PROPOSAL_GENERATION:   "Gerar propostas profissionais",
  CLIENT_PRESENTATION:   "Apresentações para clientes",
  BRIEFING_ORGANIZATION: "Organizar briefings",
  PRICING_WORKFLOW:      "Gerenciar precificação",
  VISUAL_REFERENCES:     "Organizar referências visuais",
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const updateOnboardingSchema = z.object({
  workspaceType:  WorkspaceTypeEnum.optional(),
  teamSize:       TeamSizeEnum.optional(),
  primaryGoal:    PrimaryGoalEnum.optional(),
  onboardingStep: z.number().int().min(1).max(10).optional(),
  complete:       z.boolean().optional(),
})

export const completeOnboardingSchema = z.object({
  workspaceType: WorkspaceTypeEnum,
  teamSize:      TeamSizeEnum,
  primaryGoal:   PrimaryGoalEnum,
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceType         = z.infer<typeof WorkspaceTypeEnum>
export type TeamSize              = z.infer<typeof TeamSizeEnum>
export type PrimaryGoal           = z.infer<typeof PrimaryGoalEnum>
export type UpdateOnboardingInput = z.infer<typeof updateOnboardingSchema>
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>
