import { z } from "zod";

export const PricingMethodEnum = z.enum(["HOURLY", "SQUARE_METER"]);
export const ComplexityEnum    = z.enum(["LOW", "MEDIUM", "HIGH", "PREMIUM"]);

export const calculatePricingSchema = z.object({
  pricingMethod:      PricingMethodEnum,
  complexity:         ComplexityEnum.optional().default("MEDIUM"),
  // HOURLY fields
  hourlyRate:         z.number().positive("Hourly rate must be positive").optional(),
  estimatedHours:     z.number().positive("Estimated hours must be positive").optional(),
  // SQUARE_METER fields
  pricePerSquareMeter: z.number().positive("Price per m² must be positive").optional(),
  squareMeters:       z.number().positive("Square meters must be positive").optional(),
}).superRefine((data, ctx) => {
  if (data.pricingMethod === "HOURLY") {
    if (!data.hourlyRate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hourlyRate"],     message: "hourlyRate is required for HOURLY pricing" });
    }
    if (!data.estimatedHours) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["estimatedHours"], message: "estimatedHours is required for HOURLY pricing" });
    }
  }
  if (data.pricingMethod === "SQUARE_METER") {
    if (!data.pricePerSquareMeter) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pricePerSquareMeter"], message: "pricePerSquareMeter is required for SQUARE_METER pricing" });
    }
    if (!data.squareMeters) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["squareMeters"], message: "squareMeters is required for SQUARE_METER pricing" });
    }
  }
});

export const regionalPricingQuerySchema = z.object({
  state:         z.string().length(2, "State must be a 2-letter UF").toUpperCase(),
  city:          z.string().optional(),
  projectType:   z.string().optional(),
  pricingMethod: PricingMethodEnum.optional(),
});

export const regionalPricingAdminSchema = z.object({
  stateUf:       z.string().length(2).toUpperCase(),
  city:          z.string().optional(),
  projectType:   z.string().min(2).max(100),
  pricingMethod: PricingMethodEnum,
  minValue:      z.number().positive(),
  maxValue:      z.number().positive(),
  averageValue:  z.number().positive(),
}).refine((d) => d.maxValue >= d.minValue, {
  message: "maxValue must be >= minValue",
  path: ["maxValue"],
}).refine((d) => d.averageValue >= d.minValue && d.averageValue <= d.maxValue, {
  message: "averageValue must be between minValue and maxValue",
  path: ["averageValue"],
});

export type CalculatePricingInput    = z.infer<typeof calculatePricingSchema>;
export type RegionalPricingQuery     = z.infer<typeof regionalPricingQuerySchema>;
export type RegionalPricingAdminInput = z.infer<typeof regionalPricingAdminSchema>;
