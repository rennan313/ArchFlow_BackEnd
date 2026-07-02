import { type NextRequest } from "next/server"
import { authService } from "@/services/auth.service"
import { refreshTokenSchema } from "@/validations/auth"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { authRateLimit } from "@/middlewares/rateLimiter"

export async function POST(req: NextRequest) {
  const limited = await authRateLimit(req)
  if (limited) return limited

  try {
    const body         = await req.json()
    const { refreshToken } = refreshTokenSchema.parse(body)

    const ip        = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    const result = await authService.refreshTokens(refreshToken, { ip, userAgent })
    return ok(result, "Tokens refreshed")
  } catch (error) {
    return handleServiceError(error)
  }
}
