import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Fake gateway provider ─────────────────────────────────────────────────────
const fakeProvider = {
  id: "mercadopago",
  configured: true,
  getSubscription:        vi.fn(),
  getPayment:             vi.fn(),
  createSubscription:     vi.fn(),
  cancelSubscription:     vi.fn(),
  pauseSubscription:      vi.fn(),
  resumeSubscription:     vi.fn(),
  verifyWebhookSignature: vi.fn(),
  parseWebhookRef:        vi.fn(),
}

vi.mock("@/modules/billing/providers", () => ({
  getBillingProvider: () => fakeProvider,
  activeProviderId:   "mercadopago",
}))
vi.mock("@/services/billing.service", () => ({
  billingService: { recordPaymentEvent: vi.fn(), markEventProcessed: vi.fn(), recordInvoice: vi.fn() },
}))
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { changePlan: vi.fn() },
}))
vi.mock("@/repositories/subscription.repository", () => ({
  subscriptionRepository: { findByMpSubscriptionId: vi.fn(), findById: vi.fn(), update: vi.fn() },
}))
vi.mock("@/repositories/billingPlan.repository", () => ({
  billingPlanRepository: { findByKey: vi.fn() },
}))
vi.mock("@/services/email/email.service", () => ({
  emailService: {
    sendSubscriptionCreated:  vi.fn(),
    sendPaymentApproved:      vi.fn(),
    sendSubscriptionRenewed:  vi.fn(),
    sendPaymentRejected:      vi.fn(),
    sendSubscriptionCanceled: vi.fn(),
  },
}))
vi.mock("@/utils/workspaceOwner", () => ({
  resolveOwnerContact: vi.fn().mockResolvedValue({ name: "Owner", email: "owner@test.com" }),
}))

import { billingWebhookService } from "@/modules/billing/services/billingWebhook.service"
import { billingService } from "@/services/billing.service"
import { subscriptionService } from "@/services/subscription.service"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { billingPlanRepository } from "@/repositories/billingPlan.repository"
import { emailService } from "@/services/email/email.service"

const bs       = vi.mocked(billingService)
const ss       = vi.mocked(subscriptionService)
const subRepo  = vi.mocked(subscriptionRepository)
const planRepo = vi.mocked(billingPlanRepository)
const email    = vi.mocked(emailService)

const SUB = {
  id: "sub-1", workspaceId: "ws-1", plan: "PROFESSIONAL", billingCycle: "MONTHLY",
  status: "TRIAL", mpSubscriptionId: "mp-1", cancelAtPeriodEnd: false, currentPeriodEnd: null,
}
const NEXT = new Date("2026-08-01T00:00:00Z")

const subRef     = { type: "subscription" as const, resourceId: "mp-1", externalId: "subscription:ev-1" }
const paymentRef = { type: "payment" as const, resourceId: "pay-1", externalId: "payment:ev-2" }

beforeEach(() => {
  vi.clearAllMocks()
  bs.recordPaymentEvent.mockResolvedValue({ id: "evt-1", processedAt: null } as never)
  bs.markEventProcessed.mockResolvedValue({} as never)
  bs.recordInvoice.mockResolvedValue({} as never)
  planRepo.findByKey.mockResolvedValue({ priceMonthly: 99, priceAnnual: 990 } as never)
  subRepo.update.mockResolvedValue({} as never)
  ss.changePlan.mockResolvedValue({} as never)
  fakeProvider.getSubscription.mockResolvedValue({ status: "authorized", nextPaymentDate: NEXT, raw: {} })
})

describe("billingWebhookService — subscription events", () => {
  it("activates the workspace on authorization (new subscription)", async () => {
    subRepo.findByMpSubscriptionId.mockResolvedValue({ ...SUB } as never)

    await billingWebhookService.process(subRef, "{}")

    expect(ss.changePlan).toHaveBeenCalledWith("ws-1", "PROFESSIONAL", "MONTHLY")
    expect(subRepo.update).toHaveBeenCalledWith("ws-1", expect.objectContaining({ currentPeriodEnd: NEXT, cancelAtPeriodEnd: false }))
    expect(email.sendSubscriptionCreated).toHaveBeenCalledTimes(1)
    expect(bs.markEventProcessed).toHaveBeenCalledWith("evt-1", "processed")
  })

  it("cancels immediately when not scheduled for period end", async () => {
    fakeProvider.getSubscription.mockResolvedValue({ status: "cancelled", raw: {} })
    subRepo.findByMpSubscriptionId.mockResolvedValue({ ...SUB, status: "ACTIVE", cancelAtPeriodEnd: false } as never)

    await billingWebhookService.process(subRef, "{}")

    expect(subRepo.update).toHaveBeenCalledWith("ws-1", expect.objectContaining({ status: "CANCELED" }))
    expect(email.sendSubscriptionCanceled).toHaveBeenCalledTimes(1)
  })

  it("keeps access when cancel is scheduled for period end (does not flip to CANCELED)", async () => {
    fakeProvider.getSubscription.mockResolvedValue({ status: "cancelled", raw: {} })
    subRepo.findByMpSubscriptionId.mockResolvedValue({
      ...SUB, status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: new Date(Date.now() + 86_400_000),
    } as never)

    await billingWebhookService.process(subRef, "{}")

    expect(subRepo.update).not.toHaveBeenCalledWith("ws-1", expect.objectContaining({ status: "CANCELED" }))
    expect(email.sendSubscriptionCanceled).toHaveBeenCalledTimes(1)
  })

  it("acks but does not process an event for an unknown subscription", async () => {
    subRepo.findByMpSubscriptionId.mockResolvedValue(null)

    await billingWebhookService.process(subRef, "{}")

    expect(bs.recordPaymentEvent).not.toHaveBeenCalled()
    expect(ss.changePlan).not.toHaveBeenCalled()
  })
})

describe("billingWebhookService — payment events", () => {
  it("records a paid invoice and sends the approved email on the first payment", async () => {
    fakeProvider.getPayment.mockResolvedValue({
      status: "approved", amount: 99, currency: "BRL", providerPaymentId: "pay-1",
      receiptUrl: "http://receipt", paidAt: new Date(), raw: { external_reference: "sub-1" },
    })
    subRepo.findById.mockResolvedValue({ ...SUB, status: "TRIAL" } as never)

    await billingWebhookService.process(paymentRef, "{}")

    expect(bs.recordInvoice).toHaveBeenCalledWith(expect.objectContaining({ status: "paid", mpPaymentId: "pay-1", receiptUrl: "http://receipt" }))
    expect(email.sendPaymentApproved).toHaveBeenCalledTimes(1)
    expect(email.sendSubscriptionRenewed).not.toHaveBeenCalled()
  })

  it("sends the renewal email when the subscription was already active", async () => {
    fakeProvider.getPayment.mockResolvedValue({
      status: "approved", amount: 99, currency: "BRL", providerPaymentId: "pay-2", raw: { external_reference: "sub-1" },
    })
    subRepo.findById.mockResolvedValue({ ...SUB, status: "ACTIVE" } as never)

    await billingWebhookService.process(paymentRef, "{}")

    expect(email.sendSubscriptionRenewed).toHaveBeenCalledTimes(1)
    expect(email.sendPaymentApproved).not.toHaveBeenCalled()
  })

  it("marks PAST_DUE and emails on a rejected payment", async () => {
    fakeProvider.getPayment.mockResolvedValue({
      status: "rejected", amount: 99, currency: "BRL", providerPaymentId: "pay-3", raw: { external_reference: "sub-1" },
    })
    subRepo.findById.mockResolvedValue({ ...SUB, status: "ACTIVE" } as never)

    await billingWebhookService.process(paymentRef, "{}")

    expect(bs.recordInvoice).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }))
    expect(subRepo.update).toHaveBeenCalledWith("ws-1", { status: "PAST_DUE" })
    expect(email.sendPaymentRejected).toHaveBeenCalledTimes(1)
  })
})

describe("billingWebhookService — idempotency & retry", () => {
  it("skips processing a duplicate webhook that was already processed", async () => {
    subRepo.findByMpSubscriptionId.mockResolvedValue({ ...SUB } as never)
    bs.recordPaymentEvent.mockResolvedValue({ id: "evt-1", processedAt: new Date() } as never)

    await billingWebhookService.process(subRef, "{}")

    expect(ss.changePlan).not.toHaveBeenCalled()
    expect(bs.markEventProcessed).not.toHaveBeenCalled()
  })

  it("marks the event failed and rethrows on a processing error (so MP retries)", async () => {
    subRepo.findByMpSubscriptionId.mockResolvedValue({ ...SUB } as never)
    ss.changePlan.mockRejectedValue(new Error("boom"))

    await expect(billingWebhookService.process(subRef, "{}")).rejects.toThrow("boom")
    expect(bs.markEventProcessed).toHaveBeenCalledWith("evt-1", "failed")
  })
})
