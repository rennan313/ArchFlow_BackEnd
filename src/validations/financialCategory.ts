import { z } from "zod"
import { booleanQueryParamWithDefault } from "./common"

export const FinancialDirectionEnum = z.enum(["PAYABLE", "RECEIVABLE"])

export const createFinancialCategorySchema = z.object({
  name:      z.string().min(2).max(100),
  direction: FinancialDirectionEnum,
  parentId:  z.string().min(1).optional(),
})

// archived/archivedAt/archivedBy are never editable through the generic
// update endpoint (ADR-020) — only through the dedicated archive/restore actions.
export const updateFinancialCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  // direction/parentId are intentionally not editable after creation — moving
  // a category between Receitas/Despesas or re-parenting it would silently
  // reclassify every FinancialDocument already tagged with it.
})

export const financialCategoryQuerySchema = z.object({
  direction: FinancialDirectionEnum.optional(),
  archived:  booleanQueryParamWithDefault(false),
})

export type CreateFinancialCategoryInput = z.infer<typeof createFinancialCategorySchema>
export type UpdateFinancialCategoryInput = z.infer<typeof updateFinancialCategorySchema>
export type FinancialCategoryQueryInput  = z.infer<typeof financialCategoryQuerySchema>
