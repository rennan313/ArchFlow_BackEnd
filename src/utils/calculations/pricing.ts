export type ComplexityLevel = "LOW" | "MEDIUM" | "HIGH" | "PREMIUM";
export type PricingMethodType = "HOURLY" | "SQUARE_METER";

export const COMPLEXITY_MULTIPLIERS: Record<ComplexityLevel, number> = {
  LOW:     1.0,
  MEDIUM:  1.2,
  HIGH:    1.5,
  PREMIUM: 2.0,
};

export interface CalculationInput {
  pricingMethod:       PricingMethodType;
  complexity?:         ComplexityLevel;
  hourlyRate?:         number;
  estimatedHours?:     number;
  pricePerSquareMeter?: number;
  squareMeters?:       number;
}

export interface CalculationResult {
  subtotal:            number;
  complexityMultiplier: number;
  total:               number;
  breakdown: {
    method:  PricingMethodType;
    formula: string;
  };
}

export function calculatePricing(input: CalculationInput): CalculationResult {
  const multiplier = COMPLEXITY_MULTIPLIERS[input.complexity ?? "MEDIUM"];
  let subtotal = 0;
  let formula  = "";

  if (input.pricingMethod === "HOURLY") {
    const rate  = input.hourlyRate     ?? 0;
    const hours = input.estimatedHours ?? 0;
    subtotal = rate * hours;
    formula  = `R$ ${rate}/h × ${hours}h`;
  } else {
    const priceM2     = input.pricePerSquareMeter ?? 0;
    const squareMeters = input.squareMeters       ?? 0;
    subtotal = priceM2 * squareMeters;
    formula  = `R$ ${priceM2}/m² × ${squareMeters}m²`;
  }

  const total = round2(subtotal * multiplier);

  return {
    subtotal:             round2(subtotal),
    complexityMultiplier: multiplier,
    total,
    breakdown: { method: input.pricingMethod, formula },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function suggestedRange(min: number, max: number, complexity: ComplexityLevel = "MEDIUM") {
  const m = COMPLEXITY_MULTIPLIERS[complexity];
  return {
    min:     round2(min * m),
    max:     round2(max * m),
    average: round2(((min + max) / 2) * m),
  };
}
