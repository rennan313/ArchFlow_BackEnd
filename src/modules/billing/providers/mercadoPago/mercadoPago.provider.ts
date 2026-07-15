import { env } from "@/lib/env"
import type {
  BillingGatewayProvider, CreateSubscriptionParams, GatewaySubscription, GatewayPayment,
  GatewaySubscriptionStatus, GatewayPaymentStatus, GatewayEventRef, WebhookSignatureInput,
} from "../gateway.interface"
import { mpClient } from "./mpClient"
import { verifyMercadoPagoSignature } from "../../utils/signature"
import type { MpPreapproval, MpPayment, MpWebhookBody } from "./mp.types"

const SUB_STATUS: Record<string, GatewaySubscriptionStatus> = {
  pending:    "pending",
  authorized: "authorized",
  paused:     "paused",
  cancelled:  "cancelled",
}

const PAY_STATUS: Record<string, GatewayPaymentStatus> = {
  approved:     "approved",
  pending:      "pending",
  in_process:   "pending",
  in_mediation: "pending",
  authorized:   "pending",
  rejected:     "rejected",
  refunded:     "refunded",
  charged_back: "charged_back",
  cancelled:    "cancelled",
}

function mapSub(p: MpPreapproval): GatewaySubscription {
  return {
    providerSubscriptionId: p.id,
    initPoint:              p.init_point,
    status:                 SUB_STATUS[p.status] ?? "pending",
    nextPaymentDate:        p.next_payment_date ? new Date(p.next_payment_date) : null,
    raw:                    p,
  }
}

function mapPayment(p: MpPayment): GatewayPayment {
  return {
    providerPaymentId: String(p.id),
    status:            PAY_STATUS[p.status] ?? "pending",
    amount:            p.transaction_amount,
    currency:          p.currency_id,
    paidAt:            p.date_approved ? new Date(p.date_approved) : null,
    receiptUrl:        p.transaction_details?.external_resource_url ?? null,
    raw:               p,
  }
}

// MONTHLY = every 1 month, ANNUAL = every 12 months (MP has no "years" unit).
function recurrence(cycle: CreateSubscriptionParams["cycle"]) {
  return { frequency: cycle === "ANNUAL" ? 12 : 1, frequency_type: "months" as const }
}

export const mercadoPagoProvider: BillingGatewayProvider = {
  id: "mercadopago",
  get configured() { return env.billingEnabled },

  async createSubscription(params: CreateSubscriptionParams): Promise<GatewaySubscription> {
    const { frequency, frequency_type } = recurrence(params.cycle)
    const body = {
      reason:             params.reason,
      external_reference: params.externalReference,
      payer_email:        params.payerEmail,
      back_url:           params.backUrl,
      status:             "pending",
      auto_recurring: {
        frequency,
        frequency_type,
        transaction_amount: params.amount,
        currency_id:        params.currency,
      },
      ...(params.preapprovalPlanId ? { preapproval_plan_id: params.preapprovalPlanId } : {}),
    }
    // Idempotency key = our subscription id, so a retried checkout POST never
    // creates a second preapproval for the same workspace subscription.
    const created = await mpClient.createPreapproval<MpPreapproval>(body, `sub_${params.externalReference}`)
    return mapSub(created)
  },

  async getSubscription(id: string): Promise<GatewaySubscription> {
    return mapSub(await mpClient.getPreapproval<MpPreapproval>(id))
  },

  async cancelSubscription(id: string): Promise<void> {
    await mpClient.updatePreapproval<MpPreapproval>(id, { status: "cancelled" })
  },

  async pauseSubscription(id: string): Promise<void> {
    await mpClient.updatePreapproval<MpPreapproval>(id, { status: "paused" })
  },

  async resumeSubscription(id: string): Promise<void> {
    await mpClient.updatePreapproval<MpPreapproval>(id, { status: "authorized" })
  },

  async getPayment(id: string): Promise<GatewayPayment> {
    return mapPayment(await mpClient.getPayment<MpPayment>(id))
  },

  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    return verifyMercadoPagoSignature({
      signatureHeader: input.signatureHeader,
      requestId:       input.requestId,
      dataId:          input.dataId,
      secret:          env.mpWebhookSecret,
    })
  },

  parseWebhookRef(body: unknown, query: URLSearchParams): GatewayEventRef | null {
    const b = (body ?? {}) as MpWebhookBody
    // `type` (Webhooks v2) or `topic` (legacy IPN); also fall back to query.
    const kind = String(b.type ?? b.topic ?? query.get("type") ?? query.get("topic") ?? "").toLowerCase()
    const resourceId = String(b.data?.id ?? query.get("data.id") ?? b.id ?? query.get("id") ?? "")
    if (!resourceId) return null

    const type = kind.includes("payment")                                   ? "payment"
               : kind.includes("preapproval") || kind.includes("subscription") ? "subscription"
               : "unknown"
    if (type === "unknown") return null

    // Notification id is stable across MP retries of the same delivery → good
    // idempotency key. Namespaced by resource so a payment and a preapproval
    // that happen to share a numeric id can't collide.
    const notificationId = String(b.id ?? `${type}-${resourceId}-${b.action ?? kind}`)
    return { type, resourceId, externalId: `${type}:${notificationId}`, action: b.action }
  },
}
