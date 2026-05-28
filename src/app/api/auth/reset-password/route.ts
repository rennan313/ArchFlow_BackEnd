import { type NextRequest } from "next/server";
import { authService } from "@/services/auth.service";
import { resetPasswordSchema } from "@/validations/auth";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = resetPasswordSchema.parse(body);
    await authService.resetPassword(input);
    return ok(null, "Password reset successfully");
  } catch (error) {
    return handleServiceError(error);
  }
}
