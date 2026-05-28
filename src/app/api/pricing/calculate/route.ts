import { type NextRequest } from "next/server";
import { withAuth } from "@/middlewares/auth";
import { calculatePricing, suggestedRange, COMPLEXITY_MULTIPLIERS } from "@/utils/calculations/pricing";
import { calculatePricingSchema } from "@/validations/pricing";
import { pricingService } from "@/services/pricing/pricing.service";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

export const POST = withAuth(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload) => {
  try {
    const body  = await req.json();
    const input = calculatePricingSchema.parse(body);

    const result     = calculatePricing(input);
    const complexity = input.complexity ?? "MEDIUM";

    // Fetch regional reference if state provided
    const stateUf     = body.stateUf     as string | undefined;
    const projectType = body.projectType as string | undefined;

    let regionalRange: { min: number; max: number; average: number } | null = null;
    if (stateUf) {
      regionalRange = await pricingService.getRegionalForProposal(
        stateUf,
        projectType ?? "Residencial",
        input.pricingMethod,
      );
    }

    const suggested = regionalRange
      ? suggestedRange(regionalRange.min, regionalRange.max, complexity)
      : null;

    return ok({
      subtotal:             result.subtotal,
      complexityMultiplier: result.complexityMultiplier,
      total:                result.total,
      breakdown:            result.breakdown,
      suggestedRange:       suggested,
      regional:             regionalRange,
    });
  } catch (error) {
    return handleServiceError(error);
  }
});
