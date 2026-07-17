import { z } from "zod"
import { booleanQueryParamWithDefault } from "./common"

export const createSupplierCategorySchema = z.object({
  name: z.string().min(2).max(100),
})

// archived/archivedAt/archivedBy are never editable through the generic
// update endpoint (ADR-020) — only through the dedicated archive/restore actions.
export const updateSupplierCategorySchema = createSupplierCategorySchema.partial()

export const supplierCategoryQuerySchema = z.object({
  archived: booleanQueryParamWithDefault(false),
})

export type CreateSupplierCategoryInput = z.infer<typeof createSupplierCategorySchema>
export type UpdateSupplierCategoryInput = z.infer<typeof updateSupplierCategorySchema>
export type SupplierCategoryQueryInput  = z.infer<typeof supplierCategoryQuerySchema>
