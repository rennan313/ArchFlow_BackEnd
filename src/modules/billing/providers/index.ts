import type { BillingGatewayProvider } from "./gateway.interface"
import { mercadoPagoProvider } from "./mercadoPago/mercadoPago.provider"

// Provider registry. The rest of the billing module resolves the active gateway
// through here, never by importing a concrete provider — so switching or adding
// a gateway (Stripe/Asaas) is a one-line change in this map.
const PROVIDERS: Record<string, BillingGatewayProvider> = {
  [mercadoPagoProvider.id]: mercadoPagoProvider,
}

// Single active provider for now. When multi-gateway lands, this reads from
// env/config or per-workspace preference instead of a constant.
const ACTIVE_PROVIDER_ID = "mercadopago"

export function getBillingProvider(id: string = ACTIVE_PROVIDER_ID): BillingGatewayProvider {
  const provider = PROVIDERS[id]
  if (!provider) throw new Error(`Unknown billing provider: ${id}`)
  return provider
}

export const activeProviderId = ACTIVE_PROVIDER_ID
