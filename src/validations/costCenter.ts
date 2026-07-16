import { z } from "zod"

export const createCostCenterSchema = z.object({
  name: z.string().min(2).max(100),
})

export const updateCostCenterSchema = createCostCenterSchema.partial().extend({
  isArchived: z.boolean().optional(),
})

export const costCenterQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
})

export type CreateCostCenterInput = z.infer<typeof createCostCenterSchema>
export type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>
export type CostCenterQueryInput  = z.infer<typeof costCenterQuerySchema>
