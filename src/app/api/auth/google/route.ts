import { type NextRequest } from "next/server"
import { authService } from "@/services/auth.service"
import { googleAuthSchema } from "@/validations/auth"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { authRateLimit } from "@/middlewares/rateLimiter"

export async function POST(req: NextRequest) {
  const limited = authRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = googleAuthSchema.parse(body)

    const ip        = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    const result = await authService.googleAuth(input, { ip, userAgent })
    return created(result, "Google authentication successful")
  } catch (error) {
    return handleServiceError(error)
  }
}
