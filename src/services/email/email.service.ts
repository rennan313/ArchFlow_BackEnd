import { sendMail } from "./mailer"
import { resetPasswordTemplate } from "./templates/reset-password"
import { env } from "@/lib/env"

export const emailService = {
  async sendPasswordReset(params: {
    to:    string
    name:  string
    token: string
  }): Promise<void> {
    const resetUrl   = `${env.frontendUrl}/reset-password?token=${params.token}`
    const expiresIn  = `${env.resetPasswordExpiresMin} minutos`
    const { html, text } = resetPasswordTemplate({ name: params.name, resetUrl, expiresIn })

    await sendMail({
      to:      params.to,
      subject: "Redefinição de senha — ArchFlow",
      html,
      text,
    })
  },
}
