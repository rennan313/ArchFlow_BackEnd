import { describe, it, expect, vi, beforeEach } from "vitest"

const fakeProvider = { id: "mercadopago", configured: true, createOneOffPayment: vi.fn() }

vi.mock("@/modules/billing/providers", () => ({ getBillingProvider: () => fakeProvider }))
vi.mock("@/repositories/subscription.repository", () => ({
  subscriptionRepository: { findByWorkspace: vi.fn() },
}))
vi.mock("@/repositories/aiCreditPurchase.repository", () => ({
  aiCreditPurchaseRepository: {
    create: vi.fn(), finalizeReferences: vi.fn(), setGatewayPreference: vi.fn(),
    findById: vi.fn(), listByWorkspace: vi.fn(),
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: vi.fn() } } }))

import { aiCreditPurchaseService } from "@/services/billing/aiCreditPurchase.service"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { aiCreditPurchaseRepository } from "@/repositories/aiCreditPurchase.repository"
import { prisma } from "@/lib/prisma"
import { ErrorCode } from "@/lib/errors"

const subRepo      = vi.mocked(subscriptionRepository)
const purchaseRepo = vi.mocked(aiCreditPurchaseRepository)
const db           = vi.mocked(prisma)

beforeEach(() => {
  vi.clearAllMocks()
  fakeProvider.configured = true
  subRepo.findByWorkspace.mockResolvedValue({ status: "ACTIVE" } as never)
  ;(db.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ email: "owner@test.com" } as never)
  purchaseRepo.create.mockResolvedValue({ id: "purch-1" } as never)
  purchaseRepo.finalizeReferences.mockResolvedValue({
    id: "purch-1", workspaceId: "ws-1", userId: "user-1", packageId: "150",
    credits: 150, amount: 99.9, currency: "BRL", status: "CREATED",
    externalReference: "AI_CREDIT_PURCHASE:purch-1", idempotencyKey: "ai-credit-purchase:purch-1",
  } as never)
  purchaseRepo.setGatewayPreference.mockResolvedValue(undefined as never)
  fakeProvider.createOneOffPayment.mockResolvedValue({
    providerPreferenceId: "pref-1", initPoint: "https://mp/checkout-credits", raw: {},
  })
})

describe("aiCreditPurchaseService.createCheckout", () => {
  it("snapshots credits/amount from the backend config and never trusts frontend-provided values", async () => {
    const result = await aiCreditPurchaseService.createCheckout({
      workspaceId: "ws-1", userId: "user-1", packageId: "150", backUrl: "https://app/back",
    })

    expect(purchaseRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1", userId: "user-1", packageId: "150",
      credits: 150, amount: 99.9, currency: "BRL", gateway: "mercadopago",
    }))
    expect(fakeProvider.createOneOffPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 99.9, currency: "BRL", payerEmail: "owner@test.com",
      externalReference: "AI_CREDIT_PURCHASE:purch-1",
    }))
    expect(purchaseRepo.setGatewayPreference).toHaveBeenCalledWith("purch-1", "pref-1")
    expect(result).toEqual({ initPoint: "https://mp/checkout-credits", purchaseId: "purch-1" })
  })

  it("rejects an unknown packageId before touching the repository or the gateway", async () => {
    await expect(aiCreditPurchaseService.createCheckout({
      workspaceId: "ws-1", userId: "user-1", packageId: "9999", backUrl: "x",
    })).rejects.toMatchObject({ code: ErrorCode.AI_CREDIT_PACKAGE_NOT_FOUND })

    expect(purchaseRepo.create).not.toHaveBeenCalled()
    expect(fakeProvider.createOneOffPayment).not.toHaveBeenCalled()
  })

  it("blocks a FROZEN workspace at creation time, before any purchase row is created", async () => {
    subRepo.findByWorkspace.mockResolvedValue({ status: "FROZEN" } as never)

    await expect(aiCreditPurchaseService.createCheckout({
      workspaceId: "ws-1", userId: "user-1", packageId: "150", backUrl: "x",
    })).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_FROZEN })

    expect(purchaseRepo.create).not.toHaveBeenCalled()
    expect(fakeProvider.createOneOffPayment).not.toHaveBeenCalled()
  })

  it("does not block a PAST_DUE/EXPIRED workspace — only FROZEN is a hard block for credit purchases", async () => {
    subRepo.findByWorkspace.mockResolvedValue({ status: "PAST_DUE" } as never)

    await expect(aiCreditPurchaseService.createCheckout({
      workspaceId: "ws-1", userId: "user-1", packageId: "150", backUrl: "x",
    })).resolves.toBeDefined()
  })

  it("throws BILLING_NOT_CONFIGURED when the gateway has no credentials", async () => {
    fakeProvider.configured = false

    await expect(aiCreditPurchaseService.createCheckout({
      workspaceId: "ws-1", userId: "user-1", packageId: "150", backUrl: "x",
    })).rejects.toMatchObject({ code: ErrorCode.BILLING_NOT_CONFIGURED })

    expect(purchaseRepo.create).not.toHaveBeenCalled()
  })
})

describe("aiCreditPurchaseService.getById — cross-tenant isolation", () => {
  it("returns the purchase when it belongs to the requesting workspace", async () => {
    purchaseRepo.findById.mockResolvedValue({ id: "purch-1", workspaceId: "ws-1" } as never)

    const result = await aiCreditPurchaseService.getById("purch-1", "ws-1")

    expect(result).toEqual({ id: "purch-1", workspaceId: "ws-1" })
  })

  it("404s (never leaks the purchase) when it belongs to a different workspace", async () => {
    purchaseRepo.findById.mockResolvedValue({ id: "purch-1", workspaceId: "ws-OTHER" } as never)

    await expect(aiCreditPurchaseService.getById("purch-1", "ws-1"))
      .rejects.toMatchObject({ code: ErrorCode.AI_CREDIT_PURCHASE_NOT_FOUND })
  })

  it("404s for a nonexistent purchase id", async () => {
    purchaseRepo.findById.mockResolvedValue(null)

    await expect(aiCreditPurchaseService.getById("nope", "ws-1"))
      .rejects.toMatchObject({ code: ErrorCode.AI_CREDIT_PURCHASE_NOT_FOUND })
  })
})
