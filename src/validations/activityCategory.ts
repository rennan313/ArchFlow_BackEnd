import { z } from "zod"
import { booleanQueryParamWithDefault } from "./common"

export const createActivityCategorySchema = z.object({
  name: z.string().min(2).max(100),
})

// archived/archivedAt/archivedBy are never editable through the generic
// update endpoint (ADR-020) — only through the dedicated archive/restore
// actions. isDefault is seed-only, never client-editable.
export const updateActivityCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
})

export const activityCategoryQuerySchema = z.object({
  archived: booleanQueryParamWithDefault(false),
})

export type CreateActivityCategoryInput = z.infer<typeof createActivityCategorySchema>
export type UpdateActivityCategoryInput = z.infer<typeof updateActivityCategorySchema>
export type ActivityCategoryQueryInput  = z.infer<typeof activityCategoryQuerySchema>
