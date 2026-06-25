import { z } from "zod"

export const createProposalSectionSchema = z.object({
  key:         z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "key must be kebab-case"),
  name:        z.string().min(2).max(100),
  description: z.string().max(2000).optional(),
  order:       z.coerce.number().int().min(0).optional().default(0),
})

export const updateProposalSectionSchema = createProposalSectionSchema.partial().extend({
  isArchived: z.boolean().optional(),
})

export const proposalSectionQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(50),
  search:     z.string().optional(),
  isArchived: z.coerce.boolean().optional(),
})

export type CreateProposalSectionInput = z.infer<typeof createProposalSectionSchema>
export type UpdateProposalSectionInput = z.infer<typeof updateProposalSectionSchema>
export type ProposalSectionQueryInput  = z.infer<typeof proposalSectionQuerySchema>
