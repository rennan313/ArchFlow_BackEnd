import crypto from "node:crypto"

// Mercado Pago webhook signature verification.
// https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
//
// MP sends `x-signature: ts=<unix>,v1=<hmac>` and `x-request-id`. The signed
// manifest is: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` and v1 is the
// HMAC-SHA256 of that manifest keyed by the webhook secret, hex-encoded. Compare
// in constant time. data.id is lowercased when alphanumeric (per MP guidance).

export function verifyMercadoPagoSignature(params: {
  signatureHeader: string | null
  requestId:       string | null
  dataId:          string
  secret:          string
}): boolean {
  const { signatureHeader, requestId, dataId, secret } = params
  if (!signatureHeader || !secret || !dataId) return false

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=")
      return [k?.trim(), v?.trim()]
    }),
  ) as { ts?: string; v1?: string }

  if (!parts.ts || !parts.v1) return false

  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
  const manifest = `id:${id};request-id:${requestId ?? ""};ts:${parts.ts};`

  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex")

  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(parts.v1, "utf8")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
