import { z } from "zod"
import { FinancialDirectionEnum } from "./financialCategory"

// Amount is reais (decimal, as typed by a human), converted to amountCents in
// the service layer — same boundary-conversion pattern as BankAccount's
// initialBalance. number/status are never accepted from the client: number
// is the array index, status always starts OPEN.
export const installmentInputSchema = z.object({
  amount:  z.number().positive(),
  dueDate: z.coerce.date(),
})

// totalAmountCents is deliberately NOT an input field — it is derived by
// summing the installments the client submits, so there is only ever one
// source of truth for the document total (see FinancialDocument schema
// comment on totalAmountCents).
export const createFinancialDocumentSchema = z.object({
  direction:      FinancialDirectionEnum,
  projectId:      z.string().min(1).optional(),
  clientId:       z.string().min(1).optional(),
  supplierId:     z.string().min(1).optional(),
  categoryId:     z.string().min(1),
  costCenterId:   z.string().min(1).optional(),
  description:    z.string().min(2).max(300),
  competencyDate: z.coerce.date(),
  notes:          z.string().max(2000).optional(),
  installments:   z.array(installmentInputSchema).min(1).max(360),
}).superRefine((data, ctx) => {
  if (data.direction === "PAYABLE" && data.clientId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clientId"], message: "A payable document cannot reference a client" })
  }
  if (data.direction === "RECEIVABLE" && data.supplierId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supplierId"], message: "A receivable document cannot reference a supplier" })
  }
})

// direction, projectId/clientId/supplierId and the installment plan are
// intentionally not editable after creation — changing any of them after
// installments (and possibly payments) exist would corrupt the ledger.
// Cancel and recreate instead (see financialDocumentService#cancel).
export const updateFinancialDocumentSchema = z.object({
  description:    z.string().min(2).max(300).optional(),
  competencyDate: z.coerce.date().optional(),
  categoryId:     z.string().min(1).optional(),
  costCenterId:   z.string().min(1).optional(),
  notes:          z.string().max(2000).optional(),
})

export const financialDocumentQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  direction:        FinancialDirectionEnum.optional(),
  projectId:        z.string().optional(),
  clientId:         z.string().optional(),
  supplierId:       z.string().optional(),
  categoryId:       z.string().optional(),
  costCenterId:     z.string().optional(),
  search:           z.string().optional(),
  includeCancelled: z.coerce.boolean().optional().default(false),
  sortBy:    z.enum(["competencyDate", "createdAt", "totalAmountCents"]).optional().default("competencyDate"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type InstallmentInput             = z.infer<typeof installmentInputSchema>
export type CreateFinancialDocumentInput = z.infer<typeof createFinancialDocumentSchema>
export type UpdateFinancialDocumentInput = z.infer<typeof updateFinancialDocumentSchema>
export type FinancialDocumentQueryInput  = z.infer<typeof financialDocumentQuerySchema>
