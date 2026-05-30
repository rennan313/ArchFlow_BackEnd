import { type NextRequest } from "next/server"
import { authService } from "@/services/auth.service"
import { loginSchema } from "@/validations/auth"
import { ok, unauthorized } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { authRateLimit } from "@/middlewares/rateLimiter"

export async function POST(req: NextRequest) {
  const limited = authRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = loginSchema.parse(body)
    const result = await authService.login(input)
    return ok(result, "Login successful")
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_CREDENTIALS") return unauthorized("Invalid email or password")
      if (error.message === "USE_GOOGLE")           return unauthorized("This account uses Google Sign-In.")
    }
    return handleServiceError(error)
  }
}
