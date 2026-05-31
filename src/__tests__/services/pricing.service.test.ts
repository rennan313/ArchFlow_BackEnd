import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/repositories/pricing/regional.repository")

import { pricingService } from "@/services/pricing/pricing.service"
import { regionalPricingRepository } from "@/repositories/pricing/regional.repository"

// ── Shared mock data ──────────────────────────────────────────────────────────

function mockRecord(overrides: Record<string, unknown> = {}) {
  return {
    id:            "reg-1",
    stateUf:       "SP",
    city:          null,
    projectType:   "Residencial",
    pricingMethod: "HOURLY",
    minValue:      150,
    maxValue:      250,
    averageValue:  200,
    createdAt:     new Date(),
    updatedAt:     new Date(),
    ...overrides,
  }
}

// ── pricingService.calculate ──────────────────────────────────────────────────

describe("pricingService.calculate", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns calculation result with suggestedRange: null", async () => {
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([mockRecord()] as never)

    const result = await pricingService.calculate({
      pricingMethod:  "HOURLY",
      hourlyRate:     180,
      estimatedHours: 40,
      complexity:     "MEDIUM",
    })

    expect(result.subtotal).toBe(7200)
    expect(result.total).toBe(8640)           // 7200 × 1.2 MEDIUM
    expect(result.complexityMultiplier).toBe(1.2)
    expect(result.suggestedRange).toBeNull()   // always null — use /api/pricing/regional
    expect(result.breakdown.method).toBe("HOURLY")
  })

  it("still returns calculation when regional repository throws (catch → [])", async () => {
    vi.mocked(regionalPricingRepository.findMany).mockRejectedValue(new Error("DB error"))

    const result = await pricingService.calculate({
      pricingMethod:       "SQUARE_METER",
      pricePerSquareMeter: 100,
      squareMeters:        200,
      complexity:          "MEDIUM",
    })

    expect(result.subtotal).toBe(20000)
    expect(result.total).toBe(24000)          // 20000 × 1.2 MEDIUM
    expect(result.suggestedRange).toBeNull()
  })

  it("calculates SQUARE_METER method with LOW complexity", async () => {
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([])

    const result = await pricingService.calculate({
      pricingMethod:       "SQUARE_METER",
      pricePerSquareMeter: 120,
      squareMeters:        100,
      complexity:          "LOW",
    })

    expect(result.subtotal).toBe(12000)
    expect(result.total).toBe(12000)          // ×1.0 LOW
    expect(result.breakdown.formula).toContain("120/m²")
  })

  it("returns 0 totals when rate and hours are missing", async () => {
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([])

    const result = await pricingService.calculate({ pricingMethod: "HOURLY", complexity: "MEDIUM" })

    expect(result.subtotal).toBe(0)
    expect(result.total).toBe(0)
  })
})

// ── pricingService.getRegional ────────────────────────────────────────────────

describe("pricingService.getRegional", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when no regional records found", async () => {
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([])

    const result = await pricingService.getRegional({
      state:         "SP",
      projectType:   "Residencial",
      pricingMethod: "HOURLY",
    })

    expect(result).toBeNull()
  })

  it("returns formatted result for a single matching record", async () => {
    const record = mockRecord()
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([record] as never)

    const result = await pricingService.getRegional({
      state:         "SP",
      projectType:   "Residencial",
      pricingMethod: "HOURLY",
    })

    expect(result).not.toBeNull()
    expect(result!.stateUf).toBe("SP")
    expect(result!.min).toBe(150)
    expect(result!.max).toBe(250)
    expect(result!.average).toBe(200)
    expect(result!.pricingMethod).toBe("HOURLY")
    // suggestedRange.average at MEDIUM (×1.2)
    expect(result!.suggested).toBe(240)       // ((150+250)/2) × 1.2 = 200 × 1.2
  })

  it("includes all returned records in allMethods", async () => {
    const hourly = mockRecord({ pricingMethod: "HOURLY" })
    const m2     = mockRecord({ id: "reg-2", pricingMethod: "SQUARE_METER", minValue: 80, maxValue: 140, averageValue: 110 })
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([hourly, m2] as never)

    const result = await pricingService.getRegional({ state: "SP" })

    expect(result!.allMethods).toHaveLength(2)
    expect(result!.allMethods[0].method).toBe("HOURLY")
    expect(result!.allMethods[1].method).toBe("SQUARE_METER")
  })

  it("selects the record matching the requested pricingMethod when multiple exist", async () => {
    const hourly = mockRecord({ pricingMethod: "HOURLY",       minValue: 150, maxValue: 250 })
    const m2     = mockRecord({ id: "reg-2", pricingMethod: "SQUARE_METER", minValue: 80,  maxValue: 140 })
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([hourly, m2] as never)

    const result = await pricingService.getRegional({
      state:         "SP",
      pricingMethod: "SQUARE_METER",
    })

    expect(result!.pricingMethod).toBe("SQUARE_METER")
    expect(result!.min).toBe(80)
  })

  it("falls back to first record when pricingMethod has no match", async () => {
    const hourly = mockRecord({ pricingMethod: "HOURLY" })
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([hourly] as never)

    // pricingMethod not specified — uses first record
    const result = await pricingService.getRegional({ state: "SP" })

    expect(result!.pricingMethod).toBe("HOURLY")
  })

  it("handles city in the result", async () => {
    const record = mockRecord({ city: "São Paulo" })
    vi.mocked(regionalPricingRepository.findMany).mockResolvedValue([record] as never)

    const result = await pricingService.getRegional({ state: "SP", city: "São Paulo" })

    expect(result!.city).toBe("São Paulo")
  })
})

// ── pricingService.getRegionalForProposal ─────────────────────────────────────

describe("pricingService.getRegionalForProposal", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when no record found for the state/type/method combination", async () => {
    vi.mocked(regionalPricingRepository.findOne).mockResolvedValue(null)

    const result = await pricingService.getRegionalForProposal(
      "AC", "Residencial", "HOURLY"
    )

    expect(result).toBeNull()
  })

  it("returns min/max/average from the found record", async () => {
    const record = mockRecord({ minValue: 130, maxValue: 200, averageValue: 165 })
    vi.mocked(regionalPricingRepository.findOne).mockResolvedValue(record as never)

    const result = await pricingService.getRegionalForProposal(
      "SP", "Residencial", "HOURLY"
    )

    expect(result).toEqual({ min: 130, max: 200, average: 165 })
  })

  it("calls repository with correct arguments", async () => {
    vi.mocked(regionalPricingRepository.findOne).mockResolvedValue(null)

    await pricingService.getRegionalForProposal("RJ", "Comercial", "SQUARE_METER")

    expect(regionalPricingRepository.findOne).toHaveBeenCalledWith(
      "RJ", "Comercial", "SQUARE_METER"
    )
  })
})
