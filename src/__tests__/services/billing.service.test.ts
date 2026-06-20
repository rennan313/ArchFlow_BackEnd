import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/repositories/paymentEvent.repository", () => ({
  paymentEventRepository: {
    findByExternalId:  vi.fn(),
    create:            vi.fn(),
    markProcessed:      vi.fn(),
    findBySubscription: vi.fn(),
  },
}))

vi.mock("@/repositories/billingHistory.repository", () => ({
  billingHistoryRepository: {
    create:             vi.fn(),
    findBySubscription: vi.fn(),
    findByMpPaymentId:  vi.fn(),
  },
}))

vi.mock("@/repositories/subscription.repository", () => ({
  subscriptionRepository: {
    findByWorkspace: vi.fn(),
  },
}))

import { billingService } from "@/services/billing.service"
import { paymentEventRepository } from "@/repositories/paymentEvent.repository"
import { billingHistoryRepository } from "@/repositories/billingHistory.repository"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { ErrorCode } from "@/lib/errors"

const eventRepo   = vi.mocked(paymentEventRepository)
const historyRepo = vi.mocked(billingHistoryRepository)
const subRepo     = vi.mocked(subscriptionRepository)

// ── recordPaymentEvent — idempotency ──────────────────────────────────────────

describe("billingService.recordPaymentEvent", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a new event when externalId hasn't been seen before", async () => {
    eventRepo.findByExternalId.mockResolvedValue(null)
    eventRepo.create.mockResolvedValue({ id: "evt-1", externalId: "ext-1" } as never)

    const result = await billingService.recordPaymentEvent({
      subscriptionId: "sub-1",
      provider:       "mercadopago",
      externalId:     "ext-1",
      type:           "payment.created",
      rawPayload:     "{}",
    })

    expect(eventRepo.create).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ id: "evt-1" })
  })

  it("returns the existing event instead of creating a duplicate — webhook redelivery", async () => {
    const existing = { id: "evt-1", externalId: "ext-1", status: "processed" }
    eventRepo.findByExternalId.mockResolvedValue(existing as never)

    const result = await billingService.recordPaymentEvent({
      subscriptionId: "sub-1",
      provider:       "mercadopago",
      externalId:     "ext-1",
      type:           "payment.created",
      rawPayload:     "{}",
    })

    expect(eventRepo.create).not.toHaveBeenCalled()
    expect(result).toBe(existing)
  })

  it("a second call with the same externalId never produces a second row, even with different payloads", async () => {
    // First call: nothing recorded yet
    eventRepo.findByExternalId.mockResolvedValueOnce(null)
    eventRepo.create.mockResolvedValueOnce({ id: "evt-1", externalId: "ext-dup" } as never)
    const first = await billingService.recordPaymentEvent({
      subscriptionId: "sub-1", provider: "mercadopago", externalId: "ext-dup",
      type: "payment.created", rawPayload: "{\"amount\":100}",
    })

    // Second call: gateway retried delivery with a slightly different envelope
    eventRepo.findByExternalId.mockResolvedValueOnce(first as never)
    const second = await billingService.recordPaymentEvent({
      subscriptionId: "sub-1", provider: "mercadopago", externalId: "ext-dup",
      type: "payment.created", rawPayload: "{\"amount\":100,\"retry\":true}",
    })

    expect(eventRepo.create).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })
})

describe("billingService.markEventProcessed", () => {
  beforeEach(() => vi.clearAllMocks())

  it("defaults to status=processed", async () => {
    eventRepo.markProcessed.mockResolvedValue({ id: "evt-1", status: "processed" } as never)
    await billingService.markEventProcessed("evt-1")
    expect(eventRepo.markProcessed).toHaveBeenCalledWith("evt-1", "processed")
  })

  it("accepts an explicit failed status", async () => {
    eventRepo.markProcessed.mockResolvedValue({ id: "evt-1", status: "failed" } as never)
    await billingService.markEventProcessed("evt-1", "failed")
    expect(eventRepo.markProcessed).toHaveBeenCalledWith("evt-1", "failed")
  })
})

describe("billingService.getEventsForWorkspace", () => {
  beforeEach(() => vi.clearAllMocks())

  it("resolves the subscription and lists its events", async () => {
    subRepo.findByWorkspace.mockResolvedValue({ id: "sub-1" } as never)
    eventRepo.findBySubscription.mockResolvedValue([{ id: "evt-1" }] as never)

    const result = await billingService.getEventsForWorkspace("ws-1")

    expect(eventRepo.findBySubscription).toHaveBeenCalledWith("sub-1")
    expect(result).toHaveLength(1)
  })

  it("throws SUBSCRIPTION_NOT_FOUND when the workspace has no subscription", async () => {
    subRepo.findByWorkspace.mockResolvedValue(null)
    await expect(billingService.getEventsForWorkspace("ws-1")).rejects.toMatchObject({
      code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
    })
  })
})

// ── recordInvoice — idempotency on mpPaymentId ────────────────────────────────

describe("billingService.recordInvoice", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a new invoice line", async () => {
    historyRepo.create.mockResolvedValue({ id: "bh-1", amount: 99 } as never)

    const result = await billingService.recordInvoice({
      subscriptionId: "sub-1",
      amount:         99,
      status:         "paid",
      description:    "Plano Professional",
      mpPaymentId:    "mp-1",
    })

    expect(historyRepo.create).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ id: "bh-1" })
  })

  it("defaults currency to BRL when not provided", async () => {
    historyRepo.create.mockResolvedValue({ id: "bh-1" } as never)

    await billingService.recordInvoice({
      subscriptionId: "sub-1", amount: 59, status: "paid", description: "Plano Starter",
    })

    expect(historyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ currency: "BRL" }))
  })

  it("returns the existing invoice instead of duplicating it when mpPaymentId repeats", async () => {
    const existing = { id: "bh-1", mpPaymentId: "mp-dup" }
    historyRepo.findByMpPaymentId.mockResolvedValue(existing as never)

    const result = await billingService.recordInvoice({
      subscriptionId: "sub-1", amount: 99, status: "paid",
      description: "Plano Professional (retry)", mpPaymentId: "mp-dup",
    })

    expect(historyRepo.create).not.toHaveBeenCalled()
    expect(result).toBe(existing)
  })

  it("skips the idempotency lookup entirely when no mpPaymentId is given", async () => {
    historyRepo.create.mockResolvedValue({ id: "bh-1" } as never)

    await billingService.recordInvoice({
      subscriptionId: "sub-1", amount: 0, status: "paid", description: "Ajuste manual",
    })

    expect(historyRepo.findByMpPaymentId).not.toHaveBeenCalled()
    expect(historyRepo.create).toHaveBeenCalledTimes(1)
  })
})

describe("billingService.getHistory", () => {
  beforeEach(() => vi.clearAllMocks())

  it("resolves the subscription and lists its billing history, most recent first (repository contract)", async () => {
    subRepo.findByWorkspace.mockResolvedValue({ id: "sub-1" } as never)
    historyRepo.findBySubscription.mockResolvedValue([{ id: "bh-2" }, { id: "bh-1" }] as never)

    const result = await billingService.getHistory("ws-1")

    expect(historyRepo.findBySubscription).toHaveBeenCalledWith("sub-1")
    expect(result).toHaveLength(2)
  })

  it("throws SUBSCRIPTION_NOT_FOUND when the workspace has no subscription", async () => {
    subRepo.findByWorkspace.mockResolvedValue(null)
    await expect(billingService.getHistory("ws-1")).rejects.toMatchObject({
      code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
    })
  })
})
