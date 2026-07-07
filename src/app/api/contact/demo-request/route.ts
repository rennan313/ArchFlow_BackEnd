import { type NextRequest } from "next/server"
import { emailService } from "@/services/email/email.service"
import { demoRequestSchema } from "@/validations/contact"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import { authRateLimit } from "@/middlewares/rateLimiter"

const GENERIC_RESPONSE = "Recebemos sua solicitação. Nossa equipe entrará em contato em breve."

export async function POST(req: NextRequest) {
  const limited = await authRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = demoRequestSchema.parse(body)

    // Fire-and-forget — don't delay the response waiting for SMTP, and never
    // let a mailer failure (e.g. SMTP not configured) surface as an error to
    // the visitor, same pattern as forgot-password.
    emailService
      .sendDemoRequest(input)
      .catch((err) => {
        logger.error({ err }, "[contact/demo-request] email send failed")
      })

    logger.debug({ email: input.email, company: input.company }, "[contact/demo-request] request received")

    return ok({ message: GENERIC_RESPONSE })
  } catch (error) {
    return handleServiceError(error)
  }
}
