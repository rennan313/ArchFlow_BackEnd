// Gateway-agnostic billing contract. Every payment provider (Mercado Pago now;
// Stripe/Asaas later) implements this interface, so the checkout/webhook
// orchestration in modules/billing/services never imports a provider SDK or
// knows a provider's wire format. Adding a gateway = a new file implementing
// this + a registry entry, with zero changes to the state machine.

export type BillingCycle = "MONTHLY" | "ANNUAL"

// ─── Normalized statuses (provider-specific strings are mapped in the provider) ─
export type GatewaySubscriptionStatus = "pending" | "authorized" | "paused" | "cancelled"
export type GatewayPaymentStatus =
  | "approved" | "pending" | "rejected" | "refunded" | "charged_back" | "cancelled"
export type GatewayEventType = "subscription" | "payment" | "unknown"

export interface CreateSubscriptionParams {
  reason:            string   // human-readable, shown on the checkout page
  amount:            number
  currency:          string
  cycle:             BillingCycle
  payerEmail:        string
  externalReference: string   // our Subscription.id — echoed back on every event
  backUrl:           string   // where the gateway returns the user after checkout
  preapprovalPlanId?: string | null // gateway plan id, if pre-created in its dashboard
}

export interface GatewaySubscription {
  providerSubscriptionId: string
  initPoint?:             string  // checkout URL — present on create
  status:                 GatewaySubscriptionStatus
  nextPaymentDate?:       Date | null
  raw:                    unknown
}

export interface GatewayPayment {
  providerPaymentId: string
  status:            GatewayPaymentStatus
  amount:            number
  currency:          string
  paidAt?:           Date | null
  receiptUrl?:       string | null
  raw:               unknown
}

export interface WebhookSignatureInput {
  signatureHeader: string | null // e.g. Mercado Pago's `x-signature`
  requestId:       string | null // e.g. `x-request-id`
  dataId:          string        // resource id the notification points at
}

export interface GatewayEventRef {
  type:       GatewayEventType
  resourceId: string  // id to fetch from the provider API (payment id / preapproval id)
  externalId: string  // idempotency key persisted as PaymentEvent.externalId
  action?:    string  // raw provider action, e.g. "payment.updated"
}

export interface BillingGatewayProvider {
  readonly id: string
  readonly configured: boolean

  createSubscription(params: CreateSubscriptionParams): Promise<GatewaySubscription>
  getSubscription(providerSubscriptionId: string): Promise<GatewaySubscription>
  cancelSubscription(providerSubscriptionId: string): Promise<void>
  pauseSubscription(providerSubscriptionId: string): Promise<void>
  resumeSubscription(providerSubscriptionId: string): Promise<void>
  getPayment(providerPaymentId: string): Promise<GatewayPayment>

  /** Constant-time HMAC verification of an incoming webhook. */
  verifyWebhookSignature(input: WebhookSignatureInput): boolean
  /** Extracts the normalized {type, resourceId, externalId} from a raw webhook,
   *  or null if the notification is one we don't handle. */
  parseWebhookRef(body: unknown, query: URLSearchParams): GatewayEventRef | null
}
