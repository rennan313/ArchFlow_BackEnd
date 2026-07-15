import { sendMail } from "./mailer"
import { resetPasswordTemplate } from "./templates/reset-password"
import { verifyEmailTemplate } from "./templates/verify-email"
import { demoRequestTemplate } from "./templates/demo-request"
import {
  subscriptionCreatedTemplate, paymentApprovedTemplate, paymentRejectedTemplate,
  subscriptionRenewedTemplate, subscriptionCanceledTemplate, trialEndingTemplate,
  trialExpiredTemplate,
} from "./templates/billing"
import { env } from "@/lib/env"

const PORTAL_URL = () => `${env.frontendUrl}/settings/billing`
const PLANS_URL  = () => `${env.frontendUrl}/billing/plans`

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}
function fmtDate(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—"
}
function cycleLabel(c: "MONTHLY" | "ANNUAL"): string {
  return c === "ANNUAL" ? "Anual" : "Mensal"
}

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

  async sendDemoRequest(params: {
    name:     string
    email:    string
    company:  string
    phone?:   string
    message?: string
  }): Promise<void> {
    const { html, text } = demoRequestTemplate(params)

    await sendMail({
      to:      env.salesEmail,
      subject: `Nova demonstração solicitada — ${params.company}`,
      html,
      text,
    })
  },

  // ─── Billing (Story 11) ───────────────────────────────────────────────────
  // Callers pass raw values; formatting (BRL/date/cycle) is centralized here.

  async sendSubscriptionCreated(p: { to: string; name: string; planName: string; cycle: "MONTHLY" | "ANNUAL"; amount: number; nextBilling: Date | null }): Promise<void> {
    const { html, text } = subscriptionCreatedTemplate({
      name: p.name, planName: p.planName, cycleLabel: cycleLabel(p.cycle),
      amount: fmtBRL(p.amount), nextBilling: fmtDate(p.nextBilling), portalUrl: PORTAL_URL(),
    })
    await sendMail({ to: p.to, subject: "Sua assinatura ArchFlow está ativa 🎉", html, text })
  },

  async sendPaymentApproved(p: { to: string; name: string; planName: string; amount: number; receiptUrl?: string | null }): Promise<void> {
    const { html, text } = paymentApprovedTemplate({
      name: p.name, planName: p.planName, amount: fmtBRL(p.amount),
      receiptUrl: p.receiptUrl ?? undefined, portalUrl: PORTAL_URL(),
    })
    await sendMail({ to: p.to, subject: "Pagamento aprovado — ArchFlow", html, text })
  },

  async sendPaymentRejected(p: { to: string; name: string; planName: string }): Promise<void> {
    const { html, text } = paymentRejectedTemplate({ name: p.name, planName: p.planName, portalUrl: PORTAL_URL() })
    await sendMail({ to: p.to, subject: "Pagamento recusado — ArchFlow", html, text })
  },

  async sendSubscriptionRenewed(p: { to: string; name: string; planName: string; amount: number; nextBilling: Date | null; receiptUrl?: string | null }): Promise<void> {
    const { html, text } = subscriptionRenewedTemplate({
      name: p.name, planName: p.planName, amount: fmtBRL(p.amount),
      nextBilling: fmtDate(p.nextBilling), receiptUrl: p.receiptUrl ?? undefined, portalUrl: PORTAL_URL(),
    })
    await sendMail({ to: p.to, subject: "Assinatura renovada — ArchFlow", html, text })
  },

  async sendSubscriptionCanceled(p: { to: string; name: string; planName: string; accessUntil: Date | null }): Promise<void> {
    const { html, text } = subscriptionCanceledTemplate({
      name: p.name, planName: p.planName, accessUntil: fmtDate(p.accessUntil), plansUrl: PLANS_URL(),
    })
    await sendMail({ to: p.to, subject: "Assinatura cancelada — ArchFlow", html, text })
  },

  async sendTrialEnding(p: { to: string; name: string; daysLeft: number }): Promise<void> {
    const { html, text } = trialEndingTemplate({ name: p.name, daysLeft: p.daysLeft, plansUrl: PLANS_URL() })
    await sendMail({ to: p.to, subject: "Seu período de avaliação está acabando — ArchFlow", html, text })
  },

  async sendTrialExpired(p: { to: string; name: string }): Promise<void> {
    const { html, text } = trialExpiredTemplate({ name: p.name, plansUrl: PLANS_URL() })
    await sendMail({ to: p.to, subject: "Seu período de avaliação terminou — ArchFlow", html, text })
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
