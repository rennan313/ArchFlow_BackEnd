import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/purchaseOrder.repository")
vi.mock("@/repositories/financialCategory.repository")
vi.mock("@/lib/tenantGuard")
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { purchaseOrderService } from "@/modules/purchasing/services/purchaseOrder.service"
import { purchaseOrderRepository } from "@/repositories/purchaseOrder.repository"
import { financialCategoryRepository } from "@/repositories/financialCategory.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"

const mockCategory = { id: "cat-1", workspaceId: "ws-1", direction: "PAYABLE" as const, name: "Materiais" }
const mockPO = {
  id: "po-1", workspaceId: "ws-1", status: "DRAFT" as const,
  supplierId: "sup-1", categoryId: "cat-1", totalAmountCents: 10_000n,
}

const baseCreateInput = {
  supplierId: "sup-1", categoryId: "cat-1", description: "Cimento e areia", dueDate: new Date(),
  idempotencyKey: "11111111-1111-1111-1111-111111111111",
  items: [{ description: "Cimento", quantity: 10, unitPrice: 35.5 }],
}

describe("purchaseOrderService.create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("validates every foreign reference belongs to the workspace before writing anything", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(purchaseOrderRepository.create).mockResolvedValue(mockPO as never)

    await purchaseOrderService.create("ws-1", "user-1", baseCreateInput as never)

    expect(assertWorkspaceReferences).toHaveBeenCalledWith("ws-1", expect.objectContaining({ supplierId: "sup-1", financialCategoryId: "cat-1" }))
  })

  it("rejects a category whose direction isn't PAYABLE (PURCHASE_ORDER_CATEGORY_DIRECTION_MISMATCH)", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue({ ...mockCategory, direction: "RECEIVABLE" } as never)

    await expect(
      purchaseOrderService.create("ws-1", "user-1", baseCreateInput as never),
    ).rejects.toMatchObject({ code: ErrorCode.PURCHASE_ORDER_CATEGORY_DIRECTION_MISMATCH })
    expect(purchaseOrderRepository.create).not.toHaveBeenCalled()
  })

  it("rejects when the category doesn't exist in the workspace at all (FINANCIAL_CATEGORY_NOT_FOUND)", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(null)

    await expect(
      purchaseOrderService.create("ws-1", "user-1", baseCreateInput as never),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_CATEGORY_NOT_FOUND })
  })

  it("converts item unit prices from reais to BigInt cents via the money library before persisting — never the server totaling a client-supplied amount", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(purchaseOrderRepository.create).mockResolvedValue(mockPO as never)

    await purchaseOrderService.create("ws-1", "user-1", {
      ...baseCreateInput,
      items: [{ description: "Cimento", quantity: 10, unitPrice: 35.5 }, { description: "Areia", quantity: 2, unitPrice: 100 }],
    } as never)

    expect(purchaseOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { description: "Cimento", quantity: 10, unitCents: 3_550n },
          { description: "Areia", quantity: 2, unitCents: 10_000n },
        ],
      }),
    )
  })
})

describe("purchaseOrderService.update / remove — DRAFT-only guard", () => {
  beforeEach(() => vi.clearAllMocks())

  it("update() throws PURCHASE_ORDER_NOT_DRAFT once the order is APPROVED", async () => {
    vi.mocked(purchaseOrderRepository.findById).mockResolvedValue({ ...mockPO, status: "APPROVED" } as never)

    await expect(
      purchaseOrderService.update("po-1", "ws-1", { description: "novo" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.PURCHASE_ORDER_NOT_DRAFT })
    expect(purchaseOrderRepository.update).not.toHaveBeenCalled()
  })

  it("remove() throws PURCHASE_ORDER_NOT_DRAFT once the order is APPROVED — no physical delete after approval", async () => {
    vi.mocked(purchaseOrderRepository.findById).mockResolvedValue({ ...mockPO, status: "APPROVED" } as never)

    await expect(purchaseOrderService.remove("po-1", "ws-1")).rejects.toMatchObject({ code: ErrorCode.PURCHASE_ORDER_NOT_DRAFT })
    expect(purchaseOrderRepository.delete).not.toHaveBeenCalled()
  })

  it("remove() deletes physically when still DRAFT", async () => {
    vi.mocked(purchaseOrderRepository.findById).mockResolvedValue(mockPO as never)
    vi.mocked(purchaseOrderRepository.delete).mockResolvedValue({ count: 1 } as never)

    await purchaseOrderService.remove("po-1", "ws-1")
    expect(purchaseOrderRepository.delete).toHaveBeenCalledWith("po-1", "ws-1")
  })
})

describe("purchaseOrderService.getById / approve / cancel — NOT_FOUND", () => {
  beforeEach(() => vi.clearAllMocks())

  it("getById throws PURCHASE_ORDER_NOT_FOUND for a missing/cross-tenant id", async () => {
    vi.mocked(purchaseOrderRepository.findById).mockResolvedValue(null)
    await expect(purchaseOrderService.getById("po-x", "ws-1")).rejects.toThrow(AppError)
  })

  it("approve() checks existence before ever entering the repository's transaction", async () => {
    vi.mocked(purchaseOrderRepository.findById).mockResolvedValue(null)
    await expect(purchaseOrderService.approve("po-x", "ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.PURCHASE_ORDER_NOT_FOUND })
    expect(purchaseOrderRepository.approve).not.toHaveBeenCalled()
  })

  it("cancel() checks existence before ever entering the repository's transaction", async () => {
    vi.mocked(purchaseOrderRepository.findById).mockResolvedValue(null)
    await expect(purchaseOrderService.cancel("po-x", "ws-1")).rejects.toMatchObject({ code: ErrorCode.PURCHASE_ORDER_NOT_FOUND })
    expect(purchaseOrderRepository.cancel).not.toHaveBeenCalled()
  })
})
