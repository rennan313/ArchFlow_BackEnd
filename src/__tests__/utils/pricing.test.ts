import { describe, it, expect } from "vitest"
import {
  calculatePricing,
  suggestedRange,
  COMPLEXITY_MULTIPLIERS,
} from "@/utils/calculations/pricing"

// ── COMPLEXITY_MULTIPLIERS ────────────────────────────────────────────────────

describe("COMPLEXITY_MULTIPLIERS", () => {
  it("has correct values for all levels", () => {
    expect(COMPLEXITY_MULTIPLIERS.LOW).toBe(1.0)
    expect(COMPLEXITY_MULTIPLIERS.MEDIUM).toBe(1.2)
    expect(COMPLEXITY_MULTIPLIERS.HIGH).toBe(1.5)
    expect(COMPLEXITY_MULTIPLIERS.PREMIUM).toBe(2.0)
  })
})

// ── calculatePricing — HOURLY ─────────────────────────────────────────────────

describe("calculatePricing (HOURLY)", () => {
  it("calculates subtotal = rate × hours, applies MEDIUM multiplier by default", () => {
    const result = calculatePricing({
      pricingMethod:  "HOURLY",
      hourlyRate:     180,
      estimatedHours: 40,
    })
    expect(result.subtotal).toBe(7200)
    expect(result.total).toBe(8640)          // 7200 × 1.2
    expect(result.complexityMultiplier).toBe(1.2)
    expect(result.breakdown.method).toBe("HOURLY")
    expect(result.breakdown.formula).toContain("180/h")
    expect(result.breakdown.formula).toContain("40h")
  })

  it("applies LOW complexity (×1.0) — subtotal equals total", () => {
    const result = calculatePricing({
      pricingMethod:  "HOURLY",
      hourlyRate:     100,
      estimatedHours: 10,
      complexity:     "LOW",
    })
    expect(result.subtotal).toBe(1000)
    expect(result.total).toBe(1000)
    expect(result.complexityMultiplier).toBe(1.0)
  })

  it("applies HIGH complexity (×1.5)", () => {
    const result = calculatePricing({
      pricingMethod:  "HOURLY",
      hourlyRate:     200,
      estimatedHours: 20,
      complexity:     "HIGH",
    })
    expect(result.subtotal).toBe(4000)
    expect(result.total).toBe(6000)
  })

  it("applies PREMIUM complexity (×2.0)", () => {
    const result = calculatePricing({
      pricingMethod:  "HOURLY",
      hourlyRate:     100,
      estimatedHours: 10,
      complexity:     "PREMIUM",
    })
    expect(result.total).toBe(2000)
  })

  it("returns 0 for both when rate and hours are absent", () => {
    const result = calculatePricing({ pricingMethod: "HOURLY" })
    expect(result.subtotal).toBe(0)
    expect(result.total).toBe(0)
  })

  it("rounds to 2 decimal places", () => {
    const result = calculatePricing({
      pricingMethod:  "HOURLY",
      hourlyRate:     33.33,
      estimatedHours: 3,
      complexity:     "LOW",
    })
    expect(result.total).toBe(99.99)
  })
})

// ── calculatePricing — SQUARE_METER ──────────────────────────────────────────

describe("calculatePricing (SQUARE_METER)", () => {
  it("calculates by area with MEDIUM multiplier by default", () => {
    const result = calculatePricing({
      pricingMethod:        "SQUARE_METER",
      pricePerSquareMeter:  100,
      squareMeters:         250,
    })
    expect(result.subtotal).toBe(25000)
    expect(result.total).toBe(30000)
    expect(result.breakdown.formula).toContain("100/m²")
    expect(result.breakdown.formula).toContain("250m²")
  })

  it("applies HIGH complexity (×1.5)", () => {
    const result = calculatePricing({
      pricingMethod:        "SQUARE_METER",
      pricePerSquareMeter:  120,
      squareMeters:         200,
      complexity:           "HIGH",
    })
    expect(result.subtotal).toBe(24000)
    expect(result.total).toBe(36000)
  })

  it("returns 0 when price or area are absent", () => {
    const result = calculatePricing({ pricingMethod: "SQUARE_METER" })
    expect(result.subtotal).toBe(0)
    expect(result.total).toBe(0)
  })
})

// ── suggestedRange ────────────────────────────────────────────────────────────

describe("suggestedRange", () => {
  it("computes min / max / average with MEDIUM complexity (×1.2) by default", () => {
    const range = suggestedRange(100, 200)
    expect(range.min).toBe(120)
    expect(range.max).toBe(240)
    expect(range.average).toBe(180)
  })

  it("scales with PREMIUM complexity (×2.0)", () => {
    const range = suggestedRange(100, 200, "PREMIUM")
    expect(range.min).toBe(200)
    expect(range.max).toBe(400)
    expect(range.average).toBe(300)
  })

  it("scales with LOW complexity (×1.0) — unchanged", () => {
    const range = suggestedRange(50, 150, "LOW")
    expect(range.min).toBe(50)
    expect(range.max).toBe(150)
    expect(range.average).toBe(100)
  })
})
