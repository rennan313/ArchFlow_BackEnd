// Public surface of the billing module. Routes and other modules import from
// here, never from a provider or an internal file directly — this barrel is the
// module boundary (the "billing.module" of the brief, adapted to our Next.js
// API-route architecture). Enforcement/lifecycle still live in the shared
// services/subscription.service + services/billing.service, which this module
// composes rather than duplicates.

export { getBillingProvider, activeProviderId } from "./providers"
export type {
  BillingGatewayProvider, BillingCycle, GatewayEventRef,
  GatewaySubscription, GatewayPayment,
} from "./providers/gateway.interface"

export { billingPlanService } from "./services/billingPlan.service"
export { billingCheckoutService } from "./services/billingCheckout.service"
export { billingSubscriptionService } from "./services/billingSubscription.service"
export { billingWebhookService } from "./services/billingWebhook.service"

export { handleMercadoPagoWebhook } from "./webhooks/mercadoPago.webhook"
export type { WebhookResult } from "./webhooks/mercadoPago.webhook"

export { checkoutSchema } from "./validators"
export type { CheckoutInput } from "./validators"
