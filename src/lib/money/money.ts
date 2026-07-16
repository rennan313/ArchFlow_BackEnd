// RC-2.8 — single source of truth for monetary arithmetic. Every financial
// field (Installment/Payment.amountCents, FinancialDocument.totalAmountCents,
// BankAccount.initialBalanceCents) is BigInt (BSON Int64) in the schema —
// see RC-2.2 in docs/financial-architecture.md for why. No service should
// touch `+`/`-`/`Math.round` on a money value directly; go through here.
//
// Importing this module registers BigInt.prototype.toJSON (below) as a side
// effect — every route in this app builds its response through
// src/lib/response.ts, which re-exports the money module for exactly this
// reason, so a bigint anywhere in an API payload serializes as a numeric
// string instead of throwing "Do not know how to serialize a BigInt" (the
// native behavior of JSON.stringify on bigint). This is the one global,
// slightly-unusual thing this library does; everything else is pure
// functions.

export type Cents = bigint

export function zero(): Cents {
  return 0n
}

export function add(...values: Cents[]): Cents {
  return values.reduce((sum, v) => sum + v, 0n)
}

export function subtract(a: Cents, b: Cents): Cents {
  return a - b
}

// Money × scalar quantity (e.g. unitCents × 2.5 m³ of material) — a
// multiplication BigInt can't do directly against a fractional factor.
// Same float-boundary safety as reaisToCents: converts to Number only at
// this single point, rounds immediately, never chains float ops. Compras
// (PurchaseOrderItem.totalCents) is the first caller — see
// docs/COMPRAS_ARCHITECTURE_DECISIONS.md.
export function scale(cents: Cents, factor: number): Cents {
  if (!Number.isFinite(factor)) throw new RangeError(`scale: not a finite factor (${factor})`)
  return BigInt(Math.round(Number(cents) * factor))
}

export function isPositive(v: Cents): boolean {
  return v > 0n
}

export function isNegative(v: Cents): boolean {
  return v < 0n
}

export function isZero(v: Cents): boolean {
  return v === 0n
}

export function compare(a: Cents, b: Cents): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function max(a: Cents, b: Cents): Cents {
  return a > b ? a : b
}

export function min(a: Cents, b: Cents): Cents {
  return a < b ? a : b
}

// Sum of a set of payments, netted by direction — RECEIVABLE adds,
// PAYABLE subtracts. Used for BankAccount current balance and dashboard
// cash-flow figures. The one place this sign convention is expressed.
export function netByDirection(
  entries: { amountCents: Cents; direction: "PAYABLE" | "RECEIVABLE" }[],
): Cents {
  return entries.reduce((sum, e) => sum + (e.direction === "RECEIVABLE" ? e.amountCents : -e.amountCents), 0n)
}

// Remaining balance on an installment given its payments so far. Negative
// or zero means fully covered (zero = exactly paid; this function doesn't
// decide the Installment.status — see installment.repository.ts for that
// state machine, which treats "paid >= amount" as PAID rather than relying
// on remaining <= 0 directly, to stay explicit at the call site).
export function remaining(amountCents: Cents, payments: { amountCents: Cents }[]): Cents {
  const paid = add(...payments.map((p) => p.amountCents))
  return subtract(amountCents, paid)
}

// Registers BigInt JSON serialization once per process. Idempotent —
// re-importing this module (or calling this directly) after the first call
// is a no-op assignment, not a growing side effect.
function registerBigIntJsonSerialization() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(BigInt.prototype as any).toJSON = function (this: bigint) {
    return this.toString()
  }
}
registerBigIntJsonSerialization()
