import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { auditLog } from "@/lib/auditLog"
import { logger } from "@/lib/logger"

describe("auditLog — CORE-4 (Sprint 0) single logging standard", () => {
  beforeEach(() => vi.clearAllMocks())

  it("defaults to info level and tags the message with the event name", () => {
    auditLog({ event: "payment_created", workspaceId: "ws-1" })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "payment_created", workspaceId: "ws-1" }),
      "[audit] payment_created",
    )
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("routes to logger.warn when level: 'warn'", () => {
    auditLog({ event: "payment_rejected", level: "warn" })
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: "payment_rejected" }), "[audit] payment_rejected")
  })

  it("routes to logger.error when level: 'error'", () => {
    auditLog({ event: "unexpected_error", level: "error", err: new Error("boom") })
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ event: "unexpected_error" }), "[audit] unexpected_error")
  })

  it("generates a correlationId when none is provided", () => {
    auditLog({ event: "document_created" })
    const payload = vi.mocked(logger.info).mock.calls[0]?.[0] as Record<string, unknown>
    expect(typeof payload.correlationId).toBe("string")
    expect((payload.correlationId as string).length).toBeGreaterThan(0)
  })

  it("propagates a caller-supplied correlationId instead of generating a new one", () => {
    auditLog({ event: "document_created", correlationId: "corr-fixed" })
    const payload = vi.mocked(logger.info).mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.correlationId).toBe("corr-fixed")
  })

  it("always includes a timestamp field", () => {
    auditLog({ event: "document_created" })
    const payload = vi.mocked(logger.info).mock.calls[0]?.[0] as Record<string, unknown>
    expect(typeof payload.timestamp).toBe("string")
    expect(() => new Date(payload.timestamp as string).toISOString()).not.toThrow()
  })

  it("passes through entity/entityId/userId/duration when provided", () => {
    auditLog({ event: "payment_created", entity: "Payment", entityId: "pay-1", userId: "user-1", duration: 42 })
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "Payment", entityId: "pay-1", userId: "user-1", duration: 42 }),
      expect.any(String),
    )
  })

  // CORE-4 — "nunca registrar informações sensíveis": a backstop against
  // accidentally passing a field that looks like a secret, regardless of
  // which module calls this. Not a substitute for caller discipline — just
  // a safety net for the mistake actually happening.
  it("strips fields whose key looks sensitive (password/token/secret/etc.), case-insensitively", () => {
    auditLog({
      event: "unexpected_error",
      password: "hunter2",
      accessToken: "abc.def.ghi",
      refreshToken: "xyz",
      apiKey: "sk-live-123",
      Authorization: "Bearer xyz",
      clientSecret: "shh",
      creditCardNumber: "4111111111111111",
      cvv: "123",
      // Non-sensitive fields must survive untouched.
      workspaceId: "ws-1",
      amount: "R$ 150,00",
    })

    const payload = vi.mocked(logger.info).mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload).not.toHaveProperty("password")
    expect(payload).not.toHaveProperty("accessToken")
    expect(payload).not.toHaveProperty("refreshToken")
    expect(payload).not.toHaveProperty("apiKey")
    expect(payload).not.toHaveProperty("Authorization")
    expect(payload).not.toHaveProperty("clientSecret")
    expect(payload).not.toHaveProperty("creditCardNumber")
    expect(payload).not.toHaveProperty("cvv")
    expect(payload.workspaceId).toBe("ws-1")
    expect(payload.amount).toBe("R$ 150,00")
  })
})
