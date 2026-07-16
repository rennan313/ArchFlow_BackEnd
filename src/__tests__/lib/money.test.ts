import { describe, it, expect } from "vitest"
import { add, subtract, isPositive, isNegative, isZero, compare, max, min, netByDirection, remaining, zero } from "@/lib/money/money"
import { reaisToCents, centsToReais, parseCents } from "@/lib/money/converter"
import { moneyAmountSchema, moneyBalanceSchema, MAX_REAIS_PER_ENTRY } from "@/lib/money/validators"
import { formatCentsBRL } from "@/lib/money/formatter"

describe("money.ts — BigInt arithmetic", () => {
  it("add sums an arbitrary number of Cents, including zero args", () => {
    expect(add()).toBe(0n)
    expect(add(100n)).toBe(100n)
    expect(add(100n, 200n, 300n)).toBe(600n)
    expect(add(-50n, 50n)).toBe(0n)
  })

  it("subtract", () => {
    expect(subtract(1000n, 400n)).toBe(600n)
    expect(subtract(400n, 1000n)).toBe(-600n)
  })

  it("isPositive / isNegative / isZero", () => {
    expect(isPositive(1n)).toBe(true)
    expect(isPositive(0n)).toBe(false)
    expect(isPositive(-1n)).toBe(false)
    expect(isNegative(-1n)).toBe(true)
    expect(isZero(0n)).toBe(true)
    expect(isZero(1n)).toBe(false)
  })

  it("compare", () => {
    expect(compare(1n, 2n)).toBe(-1)
    expect(compare(2n, 1n)).toBe(1)
    expect(compare(2n, 2n)).toBe(0)
  })

  it("max / min", () => {
    expect(max(10n, 20n)).toBe(20n)
    expect(min(10n, 20n)).toBe(10n)
  })

  it("netByDirection: RECEIVABLE adds, PAYABLE subtracts", () => {
    const net = netByDirection([
      { amountCents: 1000n, direction: "RECEIVABLE" },
      { amountCents: 400n, direction: "PAYABLE" },
      { amountCents: 200n, direction: "RECEIVABLE" },
    ])
    expect(net).toBe(800n) // 1000 - 400 + 200
  })

  it("remaining: amount minus sum of payments", () => {
    expect(remaining(1000n, [{ amountCents: 400n }, { amountCents: 300n }])).toBe(300n)
    expect(remaining(1000n, [])).toBe(1000n)
    expect(remaining(1000n, [{ amountCents: 1000n }])).toBe(0n)
  })

  it("zero() is the additive identity", () => {
    expect(add(zero(), 500n)).toBe(500n)
  })

  it("BigInt values beyond Int32 range are handled correctly — the entire point of RC-2.2", () => {
    // R$25,000,000.00 = 2,500,000,000 cents — exceeds Int32's ~2.147B cap
    const largeCents = 2_500_000_000n
    expect(largeCents).toBeGreaterThan(2_147_483_647n)
    expect(add(largeCents, largeCents)).toBe(5_000_000_000n)
  })
})

describe("converter.ts — reais <-> cents", () => {
  it("reaisToCents rounds to the nearest cent", () => {
    expect(reaisToCents(10)).toBe(1000n)
    expect(reaisToCents(10.5)).toBe(1050n)
    expect(reaisToCents(10.999)).toBe(1100n) // rounds up
    expect(reaisToCents(0.005)).toBe(1n) // rounds .005 -> 1 cent (banker's rounding not used, Math.round semantics)
  })

  it("reaisToCents throws on non-finite input", () => {
    expect(() => reaisToCents(Infinity)).toThrow(RangeError)
    expect(() => reaisToCents(NaN)).toThrow(RangeError)
  })

  it("reaisToCents handles large contract values without precision loss", () => {
    // R$50,000,000.00 — well beyond the old Int32 ceiling
    expect(reaisToCents(50_000_000)).toBe(5_000_000_000n)
  })

  it("centsToReais is the inverse for realistic magnitudes", () => {
    expect(centsToReais(1050n)).toBe(10.5)
    expect(centsToReais(5_000_000_000n)).toBe(50_000_000)
  })

  it("parseCents accepts bigint, numeric string, and number", () => {
    expect(parseCents(500n)).toBe(500n)
    expect(parseCents("500")).toBe(500n)
    expect(parseCents(500)).toBe(500n)
    expect(parseCents("-500")).toBe(-500n)
  })

  it("parseCents rejects non-integer strings and numbers", () => {
    expect(() => parseCents("12.5")).toThrow(RangeError)
    expect(() => parseCents("abc")).toThrow(RangeError)
    expect(() => parseCents(12.5)).toThrow(RangeError)
  })
})

describe("validators.ts — Zod bounds", () => {
  it("moneyAmountSchema accepts positive values within the ceiling", () => {
    expect(moneyAmountSchema.safeParse(100).success).toBe(true)
    expect(moneyAmountSchema.safeParse(0.01).success).toBe(true)
    expect(moneyAmountSchema.safeParse(MAX_REAIS_PER_ENTRY).success).toBe(true)
  })

  it("moneyAmountSchema rejects zero, negative, non-finite, and above-ceiling values", () => {
    expect(moneyAmountSchema.safeParse(0).success).toBe(false)
    expect(moneyAmountSchema.safeParse(-100).success).toBe(false)
    expect(moneyAmountSchema.safeParse(Infinity).success).toBe(false)
    expect(moneyAmountSchema.safeParse(MAX_REAIS_PER_ENTRY + 1).success).toBe(false)
  })

  it("moneyBalanceSchema allows negative (overdraft) and zero", () => {
    expect(moneyBalanceSchema.safeParse(-500).success).toBe(true)
    expect(moneyBalanceSchema.safeParse(0).success).toBe(true)
  })

  it("moneyBalanceSchema rejects values beyond either bound", () => {
    expect(moneyBalanceSchema.safeParse(MAX_REAIS_PER_ENTRY + 1).success).toBe(false)
    expect(moneyBalanceSchema.safeParse(-(MAX_REAIS_PER_ENTRY + 1)).success).toBe(false)
  })
})

// RC-3.2 — formatCentsBRL was RC-2.8 infrastructure that no audit log
// actually called until RC-3.4 wired it in (installment.service.ts,
// financialDocument.repository.ts); now it has real callers, it earns a test.
describe("formatter.ts — audit-log currency formatting", () => {
  it("formats whole reais with the BRL symbol and thousands separator", () => {
    expect(formatCentsBRL(15_000n)).toBe("R$ 150,00")
  })

  it("formats cents that aren't a whole real", () => {
    expect(formatCentsBRL(1_050n)).toBe("R$ 10,50")
  })

  it("formats zero", () => {
    expect(formatCentsBRL(0n)).toBe("R$ 0,00")
  })

  it("formats amounts beyond the old Int32 ceiling without precision loss", () => {
    expect(formatCentsBRL(5_000_000_000n)).toBe("R$ 50.000.000,00")
  })
})
