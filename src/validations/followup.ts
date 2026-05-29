import { z } from "zod"

export const createFollowUpSchema = z.object({
  nextContactDate: z.string().datetime({ offset: true }).or(z.string().date()),
  notes:           z.string().max(2000).optional(),
})

export const updateFollowUpSchema = z.object({
  nextContactDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  notes:           z.string().max(2000).optional(),
  completed:       z.boolean().optional(),
})

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>
