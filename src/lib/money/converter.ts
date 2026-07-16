import type { Cents } from "./money"

// The one conversion point from human-entered reais (decimal, what every
// form/Zod schema in this domain accepts) to the BigInt cents every money
// field is stored as. A single Math.round at this boundary is safe from
// float drift for any realistic financial magnitude — IEEE754 doubles carry
// 53 bits of integer precision (~9 quadrillion), so `reais * 100` never
// loses precision before rounding, unlike chained float arithmetic.
export function reaisToCents(reais: number): Cents {
  if (!Number.isFinite(reais)) throw new RangeError(`reaisToCents: not a finite number (${reais})`)
  return BigInt(Math.round(reais * 100))
}

// Inverse — for display formatting or logging only. Never feed this back
// into a Prisma write; write BigInt cents, not the float round-trip.
export function centsToReais(cents: Cents): number {
  return Number(cents) / 100
}

// Cents values arrive at API boundaries in a few shapes depending on the
// caller: a bigint (already internal), a numeric string (what
// BigInt.prototype.toJSON in money.ts produces on the way out, and what a
// well-behaved client should echo back), or occasionally a plain number
// (defensive — some internal call sites still pass a JS number before it's
// been through Zod). This is the one place all three get normalized.
export function parseCents(value: Cents | string | number): Cents {
  if (typeof value === "bigint") return value
  if (typeof value === "string") {
    if (!/^-?\d+$/.test(value)) throw new RangeError(`parseCents: not an integer string ("${value}")`)
    return BigInt(value)
  }
  if (!Number.isInteger(value)) throw new RangeError(`parseCents: not an integer (${value})`)
  return BigInt(value)
}
