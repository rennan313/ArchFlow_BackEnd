import type { NextRequest } from "next/server"
import { handleMercadoPagoWebhook } from "@/modules/billing/billing.module"

// Public endpoint — Mercado Pago calls this server-to-server, so there is no
// Bearer token. Authenticity is established by HMAC signature verification
// inside the handler (not by withAuth). All logic lives in the billing module.
export async function POST(req: NextRequest): Promise<Response> {
  const { status } = await handleMercadoPagoWebhook(req)
  return new Response(null, { status })
}
