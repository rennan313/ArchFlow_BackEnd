import { regionalPricingRepository } from "@/repositories/pricing/regional.repository";
import {
  calculatePricing,
  suggestedRange,
  COMPLEXITY_MULTIPLIERS,
  type ComplexityLevel,
} from "@/utils/calculations/pricing";
import type { CalculatePricingInput, RegionalPricingQuery } from "@/validations/pricing";

export interface PricingCalculationResult {
  subtotal:             number;
  complexityMultiplier: number;
  total:                number;
  breakdown: {
    method:  string;
    formula: string;
  };
  suggestedRange: {
    min:     number;
    max:     number;
    average: number;
  } | null;
}

export interface RegionalPricingResult {
  stateUf:      string;
  city:         string | null;
  projectType:  string;
  pricingMethod: string;
  min:          number;
  max:          number;
  average:      number;
  suggested:    number;
  allMethods:   { method: string; min: number; max: number; average: number }[];
}

export const pricingService = {
  async calculate(input: CalculatePricingInput): Promise<PricingCalculationResult> {
    const result   = calculatePricing(input);
    const regional = await regionalPricingRepository.findMany(
      "", // no state filter for pure calculation
      undefined,
      input.pricingMethod,
    ).catch(() => []);

    return {
      ...result,
      suggestedRange: null, // populated per-region; use /api/pricing/regional for this
    };
  },

  async getRegional(query: RegionalPricingQuery): Promise<RegionalPricingResult | null> {
    const { state, city, projectType, pricingMethod } = query;
    const complexity: ComplexityLevel = "MEDIUM";

    // Fetch requested method (or both)
    const records = await regionalPricingRepository.findMany(
      state,
      projectType,
      pricingMethod,
    );

    if (!records.length) return null;

    const primary = pricingMethod
      ? records.find((r) => r.pricingMethod === pricingMethod) ?? records[0]
      : records[0];

    const multiplier  = COMPLEXITY_MULTIPLIERS[complexity];
    const range       = suggestedRange(primary.minValue, primary.maxValue, complexity);

    return {
      stateUf:      primary.stateUf,
      city:         primary.city ?? null,
      projectType:  primary.projectType,
      pricingMethod: primary.pricingMethod,
      min:          primary.minValue,
      max:          primary.maxValue,
      average:      primary.averageValue,
      suggested:    range.average,
      allMethods:   records.map((r) => ({
        method:  r.pricingMethod,
        min:     r.minValue,
        max:     r.maxValue,
        average: r.averageValue,
      })),
    };
  },

  async getRegionalForProposal(
    stateUf:      string,
    projectType:  string,
    pricingMethod: "HOURLY" | "SQUARE_METER",
  ) {
    const record = await regionalPricingRepository.findOne(stateUf, projectType, pricingMethod);
    if (!record) return null;
    return { min: record.minValue, max: record.maxValue, average: record.averageValue };
  },
};
