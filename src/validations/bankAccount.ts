import { z } from "zod"

export const BankAccountTypeEnum = z.enum(["CHECKING", "SAVINGS"])

export const createBankAccountSchema = z.object({
  name:          z.string().min(2).max(100),
  bankName:      z.string().min(2).max(100),
  agency:        z.string().max(30).optional(),
  accountNumber: z.string().max(30).optional(),
  type:          BankAccountTypeEnum.optional().default("CHECKING"),
  // Reais, not cents — converted to initialBalanceCents in the service layer,
  // same boundary-conversion pattern as financial documents/installments.
  initialBalance: z.number().finite().optional().default(0),
})

export const updateBankAccountSchema = createBankAccountSchema
  .omit({ initialBalance: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })

export const bankAccountQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(false),
})

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>
export type BankAccountQueryInput  = z.infer<typeof bankAccountQuerySchema>
