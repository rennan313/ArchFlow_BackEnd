import { type NextRequest } from "next/server";
import { authService } from "@/services/auth.service";
import { refreshTokenSchema } from "@/validations/auth";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = refreshTokenSchema.parse(body);
    const tokens = await authService.refresh(refreshToken);
    return ok(tokens, "Token refreshed");
  } catch (error) {
    return handleServiceError(error);
  }
}
