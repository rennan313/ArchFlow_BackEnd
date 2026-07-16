import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/installment.repository")
vi.mock("@/lib/tenantGuard")
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { installmentService } from "@/modules/financial/services/installment.service"
import { installmentRepository } from "@/repositories/installment.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"

const baseInput = { bankAccountId: "bank-1", amount: 400, paidAt: new Date("2026-01-10"), method: "PIX" as const, idempotencyKey: "11111111-1111-1111-1111-111111111111" }

describe("installmentService.getById / list", () => {
  beforeEach(() => vi.clearAllMocks())

  it("getById throws NOT_FOUND for an installment outside the workspace", async () => {
    vi.mocked(installmentRepository.findById).mockResolvedValue(null)
    await expect(installmentService.getById("inst-1", "ws-1")).rejects.toMatchObject({ code: ErrorCode.INSTALLMENT_NOT_FOUND })
  })
})

// RC-2.1 — the service-layer fast path, distinct from the repository's own
// unique-index-backed guarantee (see installment.repository.test.ts). This
// is the "obvious replay, skip the transaction entirely" shortcut plus the
// cross-tenant defense on a replayed key.
describe("installmentService.registerPayment — idempotency fast path (RC-2.1)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns the existing payment directly on an idempotency-key replay, without re-validating or re-registering", async () => {
    const existing = { id: "pay-1", workspaceId: "ws-1", amountCents: 40_000n, idempotencyKey: baseInput.idempotencyKey }
    vi.mocked(installmentRepository.findPaymentByIdempotencyKey).mockResolvedValue(existing as never)

    const result = await installmentService.registerPayment("inst-1", "ws-1", "user-1", baseInput)

    expect(result).toEqual(existing)
    expect(assertWorkspaceReferences).not.toHaveBeenCalled()
    expect(installmentRepository.registerPayment).not.toHaveBeenCalled()
  })

  it("refuses to return a payment whose idempotencyKey was replayed against a DIFFERENT workspace (cross-tenant defense)", async () => {
    const existing = { id: "pay-1", workspaceId: "other-ws", amountCents: 40_000n, idempotencyKey: baseInput.idempotencyKey }
    vi.mocked(installmentRepository.findPaymentByIdempotencyKey).mockResolvedValue(existing as never)

    await expect(
      installmentService.registerPayment("inst-1", "ws-1", "user-1", baseInput),
    ).rejects.toMatchObject({ code: ErrorCode.INSTALLMENT_NOT_FOUND })
    expect(installmentRepository.registerPayment).not.toHaveBeenCalled()
  })

  it("validates the bank account belongs to the workspace and converts reais to cents on a genuinely new payment", async () => {
    vi.mocked(installmentRepository.findPaymentByIdempotencyKey).mockResolvedValue(null)
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(installmentRepository.registerPayment).mockResolvedValue({ id: "pay-new", amountCents: 40_000n } as never)

    await installmentService.registerPayment("inst-1", "ws-1", "user-1", baseInput)

    expect(assertWorkspaceReferences).toHaveBeenCalledWith("ws-1", { bankAccountId: "bank-1" })
    expect(installmentRepository.registerPayment).toHaveBeenCalledWith("inst-1", expect.objectContaining({
      amountCents: 40_000n, idempotencyKey: baseInput.idempotencyKey, workspaceId: "ws-1", createdByUserId: "user-1",
    }))
  })
})
