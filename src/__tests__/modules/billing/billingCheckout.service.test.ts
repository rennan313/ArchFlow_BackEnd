import { describe, it, expect, vi, beforeEach } from "vitest"

const fakeProvider = { id: "mercadopago", configured: true, createSubscription: vi.fn() }

vi.mock("@/modules/billing/providers", () => ({ getBillingProvider: () => fakeProvider }))
vi.mock("@/modules/billing/services/billingPlan.service", () => ({
  billingPlanService: { getSellablePlan: vi.fn(), priceFor: vi.fn(), mpPlanIdFor: vi.fn() },
}))
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { ensureSubscription: vi.fn() },
}))
vi.mock("@/repositories/subscription.repository", () => ({
  subscriptionRepository: { update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: vi.fn() } } }))

import { billingCheckoutService } from "@/modules/billing/services/billingCheckout.service"
import { billingPlanService } from "@/modules/billing/services/billingPlan.service"
import { subscriptionService } from "@/services/subscription.service"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { prisma } from "@/lib/prisma"
import { ErrorCode } from "@/lib/errors"

const planSvc = vi.mocked(billingPlanService)
const subSvc  = vi.mocked(subscriptionService)
const subRepo = vi.mocked(subscriptionRepository)
const db      = vi.mocked(prisma)

beforeEach(() => {
  vi.clearAllMocks()
  fakeProvider.configured = true
  planSvc.getSellablePlan.mockResolvedValue({ key: "PROFESSIONAL", name: "Professional" } as never)
  planSvc.priceFor.mockReturnValue(99)
  planSvc.mpPlanIdFor.mockReturnValue(null)
  subSvc.ensureSubscription.mockResolvedValue({ id: "sub-1", workspaceId: "ws-1" } as never)
  // resolveOwnerEmail → first (OWNER) query returns the email
  ;(db.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ email: "owner@test.com" } as never)
  subRepo.update.mockResolvedValue({} as never)
  fakeProvider.createSubscription.mockResolvedValue({ providerSubscriptionId: "mp-1", initPoint: "https://mp/checkout", status: "pending" })
})

describe("billingCheckoutService.createCheckout", () => {
  it("creates a preapproval and links it to the subscription (no access granted)", async () => {
    const result = await billingCheckoutService.createCheckout({
      workspaceId: "ws-1", planKey: "PROFESSIONAL", cycle: "MONTHLY", backUrl: "https://app/back",
    })

    expect(fakeProvider.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      externalReference: "sub-1", payerEmail: "owner@test.com", amount: 99,
    }))
    expect(subRepo.update).toHaveBeenCalledWith("ws-1", expect.objectContaining({ mpSubscriptionId: "mp-1", plan: "PROFESSIONAL" }))
    expect(result.initPoint).toBe("https://mp/checkout")
  })

  it("throws BILLING_NOT_CONFIGURED when the gateway has no credentials", async () => {
    fakeProvider.configured = false
    await expect(billingCheckoutService.createCheckout({
      workspaceId: "ws-1", planKey: "PROFESSIONAL", cycle: "MONTHLY", backUrl: "x",
    })).rejects.toMatchObject({ code: ErrorCode.BILLING_NOT_CONFIGURED })
    expect(fakeProvider.createSubscription).not.toHaveBeenCalled()
  })

  it("propagates a non-sellable plan error and never calls the gateway", async () => {
    planSvc.getSellablePlan.mockRejectedValue(Object.assign(new Error("nope"), { code: ErrorCode.BILLING_PLAN_NOT_SELLABLE }))
    await expect(billingCheckoutService.createCheckout({
      workspaceId: "ws-1", planKey: "PROFESSIONAL", cycle: "MONTHLY", backUrl: "x",
    })).rejects.toMatchObject({ code: ErrorCode.BILLING_PLAN_NOT_SELLABLE })
    expect(fakeProvider.createSubscription).not.toHaveBeenCalled()
  })
})
