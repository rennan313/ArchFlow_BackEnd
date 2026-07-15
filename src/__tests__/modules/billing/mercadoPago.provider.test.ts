import { describe, it, expect, vi } from "vitest"

// Provider pulls the token/secret from env at import — give it deterministic
// values so signature verification is testable and `configured` is true.
vi.mock("@/lib/env", () => ({
  env: { billingEnabled: true, mpAccessToken: "TEST-token", mpWebhookSecret: "shhh-secret", mpEnvironment: "sandbox" },
}))
// mpClient is the HTTP boundary — not exercised by parse/signature tests.
vi.mock("@/modules/billing/providers/mercadoPago/mpClient", () => ({
  mpClient: { createPreapproval: vi.fn(), getPreapproval: vi.fn(), updatePreapproval: vi.fn(), getPayment: vi.fn() },
}))

import crypto from "node:crypto"
import { mercadoPagoProvider } from "@/modules/billing/providers/mercadoPago/mercadoPago.provider"

describe("mercadoPagoProvider.parseWebhookRef", () => {
  const q = new URLSearchParams()

  it("classifies a payment notification", () => {
    const ref = mercadoPagoProvider.parseWebhookRef({ id: 1, type: "payment", action: "payment.updated", data: { id: "99" } }, q)
    expect(ref).toMatchObject({ type: "payment", resourceId: "99" })
    expect(ref?.externalId).toContain("payment:")
  })

  it("classifies a preapproval (subscription) notification", () => {
    const ref = mercadoPagoProvider.parseWebhookRef({ id: 2, type: "subscription_preapproval", data: { id: "mp-1" } }, q)
    expect(ref).toMatchObject({ type: "subscription", resourceId: "mp-1" })
  })

  it("returns null for an unhandled type", () => {
    expect(mercadoPagoProvider.parseWebhookRef({ type: "merchant_order", data: { id: "5" } }, q)).toBeNull()
  })

  it("returns null when there is no resource id", () => {
    expect(mercadoPagoProvider.parseWebhookRef({ type: "payment" }, q)).toBeNull()
  })
})

describe("mercadoPagoProvider.verifyWebhookSignature", () => {
  function sign(dataId: string, requestId: string, ts: string, secret: string) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    return crypto.createHmac("sha256", secret).update(manifest).digest("hex")
  }

  it("accepts a correctly signed request", () => {
    const ts = "1700000000", reqId = "req-1", dataId = "99"
    const v1 = sign(dataId, reqId, ts, "shhh-secret")
    const ok = mercadoPagoProvider.verifyWebhookSignature({
      signatureHeader: `ts=${ts},v1=${v1}`, requestId: reqId, dataId,
    })
    expect(ok).toBe(true)
  })

  it("rejects a tampered signature", () => {
    const ok = mercadoPagoProvider.verifyWebhookSignature({
      signatureHeader: `ts=1700000000,v1=deadbeef`, requestId: "req-1", dataId: "99",
    })
    expect(ok).toBe(false)
  })
})
