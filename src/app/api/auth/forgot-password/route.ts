import { type NextRequest } from "next/server";
import { authService } from "@/services/auth.service";
import { forgotPasswordSchema } from "@/validations/auth";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = forgotPasswordSchema.parse(body);
    const result = await authService.forgotPassword(input);

    // In production: send email with reset link containing the token.
    // We always return 200 to prevent email enumeration.
    const responseData = result
      ? { message: "If this email exists, a reset link has been sent" }
      : { message: "If this email exists, a reset link has been sent" };

    if (process.env.NODE_ENV === "development" && result) {
      return ok({ ...responseData, debug_token: result.token });
    }

    return ok(responseData);
  } catch (error) {
    return handleServiceError(error);
  }
}
