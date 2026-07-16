import { z } from "zod"

export const createSupplierCategorySchema = z.object({
  name: z.string().min(2).max(100),
})

export const updateSupplierCategorySchema = createSupplierCategorySchema.partial().extend({
  isArchived: z.boolean().optional(),
})

export const supplierCategoryQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
})

export type CreateSupplierCategoryInput = z.infer<typeof createSupplierCategorySchema>
export type UpdateSupplierCategoryInput = z.infer<typeof updateSupplierCategorySchema>
export type SupplierCategoryQueryInput  = z.infer<typeof supplierCategoryQuerySchema>
