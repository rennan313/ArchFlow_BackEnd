import nodemailer, { type Transporter } from "nodemailer"

let _transporter: Transporter | null = null

export function getTransporter(): Transporter {
  if (_transporter) return _transporter

  const host   = process.env.SMTP_HOST
  const port   = Number(process.env.SMTP_PORT ?? "587")
  const secure = process.env.SMTP_SECURE === "true"
  const user   = process.env.SMTP_USER
  const pass   = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error("SMTP credentials are not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)")
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
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
  const from        = process.env.SMTP_FROM ?? "ArchFlow <noreply@archflow.com.br>"

  await transporter.sendMail({
    from,
    to:      options.to,
    subject: options.subject,
    html:    options.html,
    text:    options.text,
  })
}
