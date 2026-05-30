import nodemailer, { type Transporter } from "nodemailer"
import { env } from "@/lib/env"

let _transporter: Transporter | null = null

export function getTransporter(): Transporter {
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
