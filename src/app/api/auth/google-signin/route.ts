import { type NextRequest } from "next/server"
import { z } from "zod"
import { authService } from "@/services/auth.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { authRateLimit } from "@/middlewares/rateLimiter"

const schema = z.object({
  idToken: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const limited = await authRateLimit(req)
  if (limited) return limited

  try {
    const body      = await req.json()
    const input     = schema.parse(body)
    const ip        = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined
    const result    = await authService.googleAuth({ idToken: input.idToken }, { ip, userAgent })
    return ok(result)
  } catch (error) {
    return handleServiceError(error)
  }
}
