import { z } from "zod"

export const createProposalBlockSchema = z.object({
  sectionKey:        z.string().min(2).max(60),
  name:              z.string().min(2).max(100),
  variantLabel:      z.string().max(100).optional(),
  content:           z.string().min(1).max(20000),
  toneTags:          z.array(z.string()).optional().default([]),
  sharedInWorkspace: z.boolean().optional().default(true),
})

export const updateProposalBlockSchema = createProposalBlockSchema.partial().extend({
  isArchived: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
})

export const proposalBlockQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(50),
  search:     z.string().optional(),
  sectionKey: z.string().optional(),
  isArchived: z.coerce.boolean().optional(),
  isFavorite: z.coerce.boolean().optional(),
})

export type CreateProposalBlockInput = z.infer<typeof createProposalBlockSchema>
export type UpdateProposalBlockInput = z.infer<typeof updateProposalBlockSchema>
export type ProposalBlockQueryInput  = z.infer<typeof proposalBlockQuerySchema>
