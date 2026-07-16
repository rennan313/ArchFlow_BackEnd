import { z } from "zod"
import { moneyAmountSchema } from "@/lib/money"

export const PaymentMethodEnum = z.enum(["PIX", "BOLETO", "TRANSFER", "CASH", "CARD"])

// Amount is reais (decimal), converted to amountCents (BigInt) in the
// service layer via @/lib/money — same boundary-conversion pattern as
// installments/bank account balances.
//
// idempotencyKey (RC-2.1) is mandatory, not optional: every payment write
// must be replay-safe, and there is no code path that creates a Payment
// without one (see installmentRepository.registerPayment). The frontend
// generates and persists this per-installment across retries/tabs/refresh
// — see FinancialDocumentDetailClient.tsx.
export const registerPaymentSchema = z.object({
  bankAccountId:  z.string().min(1),
  amount:         moneyAmountSchema,
  paidAt:         z.coerce.date(),
  method:         PaymentMethodEnum,
  idempotencyKey: z.string().uuid(),
})

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>
