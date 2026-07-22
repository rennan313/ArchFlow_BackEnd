import { env } from "@/lib/env"
import { logger } from "@/lib/logger"
import { AppError, ErrorCode } from "@/lib/errors"

// The ONLY place in the codebase that talks HTTP to Mercado Pago. Every other
// module (provider, services, routes) goes through the typed methods here, so
// there are never ad-hoc fetch() calls to the gateway scattered around (Story 1
// requirement). Centralizes auth, base URL, timeout and error normalization.

const MP_BASE_URL = "https://api.mercadopago.com"
const DEFAULT_TIMEOUT_MS = 12_000

interface MpRequestOptions {
  method?: "GET" | "POST" | "PUT"
  path:    string
  body?:   unknown
  /** Idempotency key — MP dedupes POSTs carrying the same value. */
  idempotencyKey?: string
  timeoutMs?: number
}

async function request<T>(opts: MpRequestOptions): Promise<T> {
  if (!env.mpAccessToken) {
    // Should never reach here — callers gate on billingEnabled first — but fail
    // loud rather than send an unauthenticated request that 401s confusingly.
    throw new AppError(ErrorCode.BILLING_NOT_CONFIGURED)
  }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const startedAt  = Date.now()

  try {
    const res = await fetch(`${MP_BASE_URL}${opts.path}`, {
      method:  opts.method ?? "GET",
      signal:  controller.signal,
      headers: {
        "Authorization": `Bearer ${env.mpAccessToken}`,
        "Content-Type":  "application/json",
        ...(opts.idempotencyKey ? { "X-Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })

    const ms   = Date.now() - startedAt
    const text = await res.text()
    const json = text ? safeJson(text) : null

    if (!res.ok) {
      logger.error(
        { provider: "mercadopago", path: opts.path, method: opts.method ?? "GET", status: res.status, ms, body: json },
        "[billing] Mercado Pago API error",
      )
      throw new AppError(ErrorCode.BILLING_PROVIDER_ERROR, `MP ${res.status} on ${opts.path}`)
    }

    logger.debug({ provider: "mercadopago", path: opts.path, method: opts.method ?? "GET", status: res.status, ms }, "[billing] MP call ok")
    return json as T
  } catch (err) {
    if (err instanceof AppError) throw err
    // Timeout/abort or network failure — normalized so the caller can persist
    // the event and reply 200, or surface a retryable checkout error.
    logger.error({ provider: "mercadopago", path: opts.path, err: String(err) }, "[billing] MP request failed")
    throw new AppError(ErrorCode.BILLING_PROVIDER_ERROR, "Mercado Pago request failed")
  } finally {
    clearTimeout(timeout)
  }
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return { raw: text } }
}

export const mpClient = {
  createPreapproval:  <T>(body: unknown, idempotencyKey: string) => request<T>({ method: "POST", path: "/preapproval", body, idempotencyKey }),
  getPreapproval:     <T>(id: string) => request<T>({ method: "GET", path: `/preapproval/${id}` }),
  updatePreapproval:  <T>(id: string, body: unknown) => request<T>({ method: "PUT", path: `/preapproval/${id}`, body }),
  getPayment:         <T>(id: string) => request<T>({ method: "GET", path: `/v1/payments/${id}` }),
  // Checkout Pro one-off payment preference (AI credit packs) — distinct from
  // /preapproval above, which is only for recurring subscriptions.
  createPreference:   <T>(body: unknown, idempotencyKey: string) => request<T>({ method: "POST", path: "/checkout/preferences", body, idempotencyKey }),
}
