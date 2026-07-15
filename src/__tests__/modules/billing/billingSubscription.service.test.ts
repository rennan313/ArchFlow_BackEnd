import { describe, it, expect, vi, beforeEach } from "vitest"

const fakeProvider = { id: "mercadopago", configured: true, cancelSubscription: vi.fn() }

vi.mock("@/modules/billing/providers", () => ({ getBillingProvider: () => fakeProvider }))
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: {
    getActiveSubscription:   vi.fn(),
    cancelSubscription:      vi.fn(),
    reactivateSubscription:  vi.fn(),
  },
}))

import { billingSubscriptionService } from "@/modules/billing/services/billingSubscription.service"
import { subscriptionService } from "@/services/subscription.service"
import { ErrorCode } from "@/lib/errors"

const ss = vi.mocked(subscriptionService)

beforeEach(() => {
  vi.clearAllMocks()
  fakeProvider.configured = true
  ss.getActiveSubscription.mockResolvedValue({ id: "sub-1", workspaceId: "ws-1", mpSubscriptionId: "mp-1" } as never)
  ss.cancelSubscription.mockResolvedValue({ id: "sub-1", cancelAtPeriodEnd: true } as never)
  ss.reactivateSubscription.mockResolvedValue({ id: "sub-1", cancelAtPeriodEnd: false } as never)
  fakeProvider.cancelSubscription.mockResolvedValue(undefined)
})

describe("billingSubscriptionService.cancel", () => {
  it("stops gateway renewal and records the local cancel intent", async () => {
    await billingSubscriptionService.cancel("ws-1")
    expect(fakeProvider.cancelSubscription).toHaveBeenCalledWith("mp-1")
    expect(ss.cancelSubscription).toHaveBeenCalledWith("ws-1")
  })

  it("still records the local intent even if the gateway cancel fails", async () => {
    fakeProvider.cancelSubscription.mockRejectedValue(new Error("MP down"))
    await billingSubscriptionService.cancel("ws-1")
    expect(ss.cancelSubscription).toHaveBeenCalledWith("ws-1")
  })

  it("throws SUBSCRIPTION_NOT_FOUND when there is no subscription", async () => {
    ss.getActiveSubscription.mockResolvedValue(null)
    await expect(billingSubscriptionService.cancel("ws-1")).rejects.toMatchObject({ code: ErrorCode.SUBSCRIPTION_NOT_FOUND })
  })
})

describe("billingSubscriptionService.reactivate", () => {
  it("clears the pending cancellation", async () => {
    await billingSubscriptionService.reactivate("ws-1")
    expect(ss.reactivateSubscription).toHaveBeenCalledWith("ws-1")
  })
})
