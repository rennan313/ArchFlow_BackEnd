import { z } from "zod"
import { booleanQueryParam } from "./common"

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

// archived/archivedAt/archivedBy are never editable through the generic
// update endpoint (ADR-020) — they only ever change via the dedicated
// archive/restore actions, which is the only path that stamps attribution
// and emits an audit event.
export const updateProposalTemplateSchema = createProposalTemplateSchema.partial().extend({
  isFavorite: z.boolean().optional(),
})

export const proposalTemplateQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).optional().default(1),
  limit:    z.coerce.number().int().min(1).max(100).optional().default(50),
  search:   z.string().optional(),
  archived: booleanQueryParam.optional(),
})

export type ProposalSkin               = z.infer<typeof proposalSkinSchema>
export type CreateProposalTemplateInput = z.infer<typeof createProposalTemplateSchema>
export type UpdateProposalTemplateInput = z.infer<typeof updateProposalTemplateSchema>
export type ProposalTemplateQueryInput  = z.infer<typeof proposalTemplateQuerySchema>
