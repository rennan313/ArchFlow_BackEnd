import { type NextRequest } from "next/server";
import { authService } from "@/services/auth.service";
import { resetPasswordSchema } from "@/validations/auth";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import { authRateLimit } from "@/middlewares/rateLimiter";

export async function POST(req: NextRequest) {
  const limited = authRateLimit(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const input = resetPasswordSchema.parse(body);
    await authService.resetPassword(input);
    return ok(null, "Password reset successfully");
  } catch (error) {
    return handleServiceError(error);
  }
}
