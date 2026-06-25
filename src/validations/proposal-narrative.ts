import { z } from "zod"

export const createProposalNarrativeSchema = z.object({
  name:        z.string().min(2).max(100),
  description: z.string().max(2000).optional(),
  toneKey:     z.string().min(2).max(60),
  sectionFlow: z.array(z.string()).optional().default([]),
})

export const updateProposalNarrativeSchema = createProposalNarrativeSchema.partial().extend({
  isArchived: z.boolean().optional(),
})

export const proposalNarrativeQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(50),
  search:     z.string().optional(),
  isArchived: z.coerce.boolean().optional(),
})

export type CreateProposalNarrativeInput = z.infer<typeof createProposalNarrativeSchema>
export type UpdateProposalNarrativeInput = z.infer<typeof updateProposalNarrativeSchema>
export type ProposalNarrativeQueryInput  = z.infer<typeof proposalNarrativeQuerySchema>
