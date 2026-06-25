import { z } from "zod"

export const proposalSkinSchema = z.enum([
  "EDITORIAL", "MINIMAL", "PREMIUM", "CORPORATE", "LUXURY",
  "ENTERPRISE_LIGHT", "ENTERPRISE_DARK", "PREMIUM_GOLD", "CORPORATE_EXECUTIVE",
])

export const createProposalTemplateSchema = z.object({
  name:         z.string().min(2).max(100),
  description:  z.string().max(2000).optional(),
  skin:         proposalSkinSchema.optional().default("EDITORIAL"),
  sectionOrder: z.array(z.string()).optional().default([]),
})

export const updateProposalTemplateSchema = createProposalTemplateSchema.partial().extend({
  isArchived: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
})

export const proposalTemplateQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(50),
  search:     z.string().optional(),
  isArchived: z.coerce.boolean().optional(),
})

export type ProposalSkin               = z.infer<typeof proposalSkinSchema>
export type CreateProposalTemplateInput = z.infer<typeof createProposalTemplateSchema>
export type UpdateProposalTemplateInput = z.infer<typeof updateProposalTemplateSchema>
export type ProposalTemplateQueryInput  = z.infer<typeof proposalTemplateQuerySchema>
