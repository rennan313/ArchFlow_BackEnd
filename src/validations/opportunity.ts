import { z } from "zod"
import { booleanQueryParam } from "./common"

export const OpportunityStageEnum = z.enum([
  "LEAD", "FIRST_CONTACT", "BRIEFING", "PROPOSAL_DRAFT", "PROPOSAL_SENT",
  "NEGOTIATION", "APPROVED", "LOST",
])

export const STAGE_PROBABILITY: Record<string, number> = {
  LEAD:          10,
  FIRST_CONTACT: 15,
  BRIEFING:      25,
  PROPOSAL_DRAFT: 50,
  PROPOSAL_SENT:  70,
  NEGOTIATION:   85,
  APPROVED:     100,
  LOST:           0,
}

export const createOpportunitySchema = z.object({
  clientId:        z.string().min(1),
  title:           z.string().min(2).max(200),
  projectType:     z.string().min(2).max(100),
  city:            z.string().max(100).optional(),
  state:           z.string().length(2).toUpperCase().optional(),
  squareMeters:    z.number().positive().optional(),
  estimatedBudget: z.number().nonnegative().optional(),
  estimatedRevenue: z.number().nonnegative().optional(),
  stage:           OpportunityStageEnum.optional().default("LEAD"),
  source:          z.string().max(100).optional(),
})

export const updateOpportunitySchema = createOpportunitySchema
  .omit({ clientId: true })
  .extend({
    probability: z.number().min(0).max(100).optional(),
    // Kanban Sprint — Fase A (MEL-04). Optional optimistic-concurrency token:
    // when present, the write only succeeds if the record's current
    // updatedAt still matches this value — otherwise it's rejected as
    // STALE_WRITE (409). Omitted by callers not yet updated to send it
    // (backward compatible — falls back to the pre-existing unconditional
    // update). The Kanban board sends it on every stage move.
    expectedUpdatedAt: z.coerce.date().optional(),
  })
  .partial()

export const opportunityQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(200).optional().default(20),
  search:    z.string().optional(),
  stage:     OpportunityStageEnum.optional(),
  clientId:  z.string().optional(),
  sortBy:    z.enum(["createdAt", "updatedAt", "estimatedRevenue", "probability"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  archived:  booleanQueryParam.optional(),
})

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>
export type OpportunityQueryInput  = z.infer<typeof opportunityQuerySchema>
