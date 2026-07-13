import { z } from "zod"

export const addSectionInstanceSchema = z.object({
  sectionId: z.string().min(1),
  blockId:   z.string().min(1).optional(),
  title:     z.string().max(200).optional(),
  content:   z.string().max(20000).optional(),
  // Typed premium-narrative payload (JSON string) — passed by the Builder's
  // duplicate action so a copied premium section keeps its structure.
  metadata:  z.string().max(20000).optional(),
})

export const updateSectionInstanceSchema = z.object({
  title:    z.string().min(1).max(200).optional(),
  content:  z.string().max(20000).optional(),
  metadata: z.string().max(20000).optional(),
  isHidden: z.boolean().optional(),
})

export const reorderSectionInstancesSchema = z.object({
  order: z.array(z.string().min(1)).min(1).max(100),
})

export type AddSectionInstanceInput     = z.infer<typeof addSectionInstanceSchema>
export type UpdateSectionInstanceInput  = z.infer<typeof updateSectionInstanceSchema>
export type ReorderSectionInstancesInput = z.infer<typeof reorderSectionInstancesSchema>
