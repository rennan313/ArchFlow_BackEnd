import { z } from "zod"
import { booleanQueryParamWithDefault } from "./common"

export const createCostCenterSchema = z.object({
  name: z.string().min(2).max(100),
})

// archived/archivedAt/archivedBy are never editable through the generic
// update endpoint (ADR-020) — only through the dedicated archive/restore actions.
export const updateCostCenterSchema = createCostCenterSchema.partial()

export const costCenterQuerySchema = z.object({
  archived: booleanQueryParamWithDefault(false),
})

export type CreateCostCenterInput = z.infer<typeof createCostCenterSchema>
export type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>
export type CostCenterQueryInput  = z.infer<typeof costCenterQuerySchema>
