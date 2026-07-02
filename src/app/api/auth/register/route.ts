import { type NextRequest } from "next/server"
import { authService } from "@/services/auth.service"
import { emailService } from "@/services/email/email.service"
import { credentialsRegisterSchema } from "@/validations/auth"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import { authRateLimit } from "@/middlewares/rateLimiter"

export async function POST(req: NextRequest) {
  const limited = await authRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = credentialsRegisterSchema.parse(body)
    const result = await authService.register(input)

    // Fire-and-forget — don't delay response waiting for SMTP
    authService
      .sendEmailVerification({ email: result.user.email })
      .then((verification) => {
        if (!verification) return
        return emailService.sendVerificationEmail({
          to:    verification.user.email,
          name:  verification.user.name,
          token: verification.token,
        })
      })
      .catch((err) => {
        logger.error({ err }, "[register] verification email send failed")
      })

    return created(result, "Account created successfully")
  } catch (error) {
    return handleServiceError(error)
  }
}
