import { type NextRequest } from "next/server";
import { authService } from "@/services/auth.service";
import { loginSchema } from "@/validations/auth";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = loginSchema.parse(body);
    const result = await authService.login(input);
    return ok(result, "Login successful");
  } catch (error) {
    return handleServiceError(error);
  }
}
