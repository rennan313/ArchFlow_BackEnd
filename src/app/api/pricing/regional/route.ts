import { type NextRequest } from "next/server";
import { pricingService } from "@/services/pricing/pricing.service";
import { regionalPricingQuerySchema } from "@/validations/pricing";
import { ok, notFound } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";

export async function GET(req: NextRequest) {
  try {
    const raw = {
      state:         req.nextUrl.searchParams.get("state")         ?? undefined,
      city:          req.nextUrl.searchParams.get("city")          ?? undefined,
      projectType:   req.nextUrl.searchParams.get("projectType")   ?? undefined,
      pricingMethod: req.nextUrl.searchParams.get("pricingMethod") ?? undefined,
    };

    const query  = regionalPricingQuerySchema.parse(raw);
    const result = await pricingService.getRegional(query);

    if (!result) {
      return notFound("No regional pricing data found for the given filters");
    }

    return ok(result);
  } catch (error) {
    return handleServiceError(error);
  }
}
