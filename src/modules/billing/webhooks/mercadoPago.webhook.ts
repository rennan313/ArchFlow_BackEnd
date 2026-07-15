import type { NextRequest } from "next/server"
import { logger } from "@/lib/logger"
import { env } from "@/lib/env"
import { getBillingProvider } from "../providers"
import { billingWebhookService } from "../services/billingWebhook.service"

export interface WebhookResult { status: number }

// Orchestrates one Mercado Pago webhook delivery:
//   parse → verify signature → delegate to the state machine → map to a status.
// Kept thin: all business logic is in billingWebhookService. Returns a status
// the route echoes back to MP (200 ack; 401 bad signature; 500 → MP retries).
export async function handleMercadoPagoWebhook(req: NextRequest): Promise<WebhookResult> {
  // Billing not configured → ack so MP doesn't hammer a server that can't act.
  if (!env.billingEnabled) {
    logger.warn("[billing] webhook received but billing is not configured — acked")
    return { status: 200 }
  }

  const provider = getBillingProvider()
  const url      = new URL(req.url)
  const rawBody  = await req.text()
  const body     = rawBody ? safeJson(rawBody) : {}

  const ref = provider.parseWebhookRef(body, url.searchParams)
  if (!ref) {
    // Notification type we don't handle (e.g. merchant_order) — ack.
    return { status: 200 }
  }

  const valid = provider.verifyWebhookSignature({
    signatureHeader: req.headers.get("x-signature"),
    requestId:       req.headers.get("x-request-id"),
    dataId:          ref.resourceId,
  })
  if (!valid) {
    logger.warn({ resourceId: ref.resourceId }, "[billing] webhook signature invalid — rejected")
    return { status: 401 }
  }

  try {
    await billingWebhookService.process(ref, rawBody)
    return { status: 200 }
  } catch (err) {
    // Event is persisted (status "failed"); 500 tells MP to retry, and the
    // reprocess is idempotent. This is the primary retry mechanism (Story 12).
    logger.error({ ref, err: String(err) }, "[billing] webhook processing failed — will be retried")
    return { status: 500 }
  }
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return {} }
}
