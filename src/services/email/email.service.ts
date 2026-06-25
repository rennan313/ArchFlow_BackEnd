import { sendMail } from "./mailer"
import { resetPasswordTemplate } from "./templates/reset-password"
import { verifyEmailTemplate } from "./templates/verify-email"
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

  async sendVerificationEmail(params: {
    to:    string
    name:  string
    token: string
  }): Promise<void> {
    const verifyUrl = `${env.frontendUrl}/verify-email?token=${params.token}`
    const expiresIn = formatExpiry(env.emailVerificationExpiresMin)
    const { html, text } = verifyEmailTemplate({ name: params.name, verifyUrl, expiresIn })

    await sendMail({
      to:      params.to,
      subject: "Confirme seu e-mail — ArchFlow",
      html,
      text,
    })
  },
}

function formatExpiry(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return days === 1 ? "1 dia" : `${days} dias`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? "1 hora" : `${hours} horas`
  }
  return `${minutes} minutos`
}
