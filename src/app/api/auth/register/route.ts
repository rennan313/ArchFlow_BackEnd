import { type NextRequest } from "next/server";
import { authService } from "@/services/auth.service";
import { registerSchema } from "@/validations/auth";
import { created } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = registerSchema.parse(body);
    const user = await authService.register(input);
    return created(user, "Account created successfully");
  } catch (error) {
    return handleServiceError(error);
  }
}
