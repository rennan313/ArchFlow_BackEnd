import { type NextRequest } from "next/server"
import { authService } from "@/services/auth.service"
import { emailService } from "@/services/email/email.service"
import { forgotPasswordSchema } from "@/validations/auth"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"

const GENERIC_RESPONSE = "Se este e-mail estiver cadastrado, você receberá um link de redefinição em breve."

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = forgotPasswordSchema.parse(body)

    const result = await authService.forgotPassword(input)

    if (result) {
      // Fire-and-forget — don't delay response waiting for SMTP
      emailService
        .sendPasswordReset({
          to:    result.user.email,
          name:  result.user.name,
          token: result.token,
        })
        .catch((err) => {
          console.error("[forgot-password] email send failed:", err?.message)
        })
    }

    // Always return generic message to prevent email enumeration
    if (process.env.NODE_ENV === "development" && result) {
      return ok({ message: GENERIC_RESPONSE, debug_token: result.token })
    }

    return ok({ message: GENERIC_RESPONSE })
  } catch (error) {
    return handleServiceError(error)
  }
}
