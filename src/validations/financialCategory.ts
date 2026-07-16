import { z } from "zod"

export const FinancialDirectionEnum = z.enum(["PAYABLE", "RECEIVABLE"])

export const createFinancialCategorySchema = z.object({
  name:      z.string().min(2).max(100),
  direction: FinancialDirectionEnum,
  parentId:  z.string().min(1).optional(),
})

export const updateFinancialCategorySchema = z.object({
  name:       z.string().min(2).max(100).optional(),
  isArchived: z.boolean().optional(),
  // direction/parentId are intentionally not editable after creation — moving
  // a category between Receitas/Despesas or re-parenting it would silently
  // reclassify every FinancialDocument already tagged with it.
})

export const financialCategoryQuerySchema = z.object({
  direction:       FinancialDirectionEnum.optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
})

export type CreateFinancialCategoryInput = z.infer<typeof createFinancialCategorySchema>
export type UpdateFinancialCategoryInput = z.infer<typeof updateFinancialCategorySchema>
export type FinancialCategoryQueryInput  = z.infer<typeof financialCategoryQuerySchema>
