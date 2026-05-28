import { sendMail } from "./mailer"
import { resetPasswordTemplate } from "./templates/reset-password"

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3001"
const EXPIRES_LABEL = `${process.env.RESET_PASSWORD_EXPIRES_IN_MINUTES ?? 30} minutos`

export const emailService = {
  async sendPasswordReset(params: {
    to:    string
    name:  string
    token: string
  }): Promise<void> {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${params.token}`
    const { html, text } = resetPasswordTemplate({
      name:      params.name,
      resetUrl,
      expiresIn: EXPIRES_LABEL,
    })

    await sendMail({
      to:      params.to,
      subject: "Redefinição de senha — ArchFlow",
      html,
      text,
    })
  },
}
