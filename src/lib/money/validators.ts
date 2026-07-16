import { z } from "zod"

// BigInt storage has no realistic overflow ceiling (Int64 caps at ~92
// quadrillion cents), so this bound isn't a technical limit — it's a sanity
// guard against fat-finger input (e.g. an extra zero turning R$10.000 into
// R$100.000.000) and against pathological values reaching the ledger
// unchecked. "Nunca permitir overflow silencioso" applies here too: a
// value this large should be rejected loudly by Zod, not accepted and
// discovered later.
export const MAX_REAIS_PER_ENTRY = 999_999_999.99 // ~R$1 bilhão per single field

// A positive monetary amount entered by a human (installment amount,
// payment amount) — reais, decimal, not yet converted to cents.
export const moneyAmountSchema = z.number()
  .finite()
  .positive()
  .max(MAX_REAIS_PER_ENTRY, `Valor não pode exceder R$ ${MAX_REAIS_PER_ENTRY.toLocaleString("pt-BR")}`)

// A balance that may legitimately be negative or zero (BankAccount initial
// balance — overdraft is a real starting state for an office's account).
export const moneyBalanceSchema = z.number()
  .finite()
  .min(-MAX_REAIS_PER_ENTRY)
  .max(MAX_REAIS_PER_ENTRY)
