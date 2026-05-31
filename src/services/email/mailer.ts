import nodemailer, { type Transporter } from "nodemailer"
import { env } from "@/lib/env"
import { logger } from "@/lib/logger"

let _transporter: Transporter | null = null

/**
 * Returns a configured Nodemailer transporter.
 * Throws EMAIL_NOT_CONFIGURED if SMTP credentials are absent,
 * allowing callers to degrade gracefully instead of crashing the server.
 */
export function getTransporter(): Transporter {
  if (!env.emailEnabled) {
    logger.warn(
      "Email delivery is disabled — SMTP_HOST, SMTP_USER, and SMTP_PASS are not configured. " +
      "Set these environment variables to enable password-reset emails.",
    )
    throw new Error("EMAIL_NOT_CONFIGURED")
  }

  if (_transporter) return _transporter

  _transporter = nodemailer.createTransport({
    host:   env.smtpHost,
    port:   env.smtpPort,
    secure: env.smtpSecure,
    auth:   { user: env.smtpUser, pass: env.smtpPass },
    tls:    { rejectUnauthorized: false },
  })

  return _transporter
}

export async function sendMail(options: {
  to:      string
  subject: string
  html:    string
  text?:   string
}): Promise<void> {
  const transporter = getTransporter()

  await transporter.sendMail({
    from:    env.smtpFrom,
    to:      options.to,
    subject: options.subject,
    html:    options.html,
    text:    options.text,
  })
}
