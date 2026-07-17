import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/financialCategory.repository")
vi.mock("@/services/entityLifecycle.service")

import { financialCategoryService } from "@/modules/financial/services/financialCategory.service"
import { financialCategoryRepository } from "@/repositories/financialCategory.repository"
import { entityLifecycleService } from "@/services/entityLifecycle.service"

const mockParentExpense = { id: "parent-1", workspaceId: "ws-1", direction: "PAYABLE" as const, parentId: null }

describe("financialCategoryService.create — hierarchy & direction", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a root category with no parent", async () => {
    vi.mocked(financialCategoryRepository.findByNameUnderParent).mockResolvedValue(null)
    vi.mocked(financialCategoryRepository.create).mockResolvedValue({ id: "cat-1" } as never)

    await financialCategoryService.create("ws-1", { name: "Marcenaria", direction: "PAYABLE" })

    expect(financialCategoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Marcenaria", direction: "PAYABLE", parentId: undefined }),
    )
  })

  it("rejects a child whose direction differs from its parent's (would double-count in a future DRE)", async () => {
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockParentExpense as never)

    await expect(
      financialCategoryService.create("ws-1", { name: "Sub", direction: "RECEIVABLE", parentId: "parent-1" }),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_CATEGORY_DIRECTION_MISMATCH })
    expect(financialCategoryRepository.create).not.toHaveBeenCalled()
  })

  it("allows a child with the same direction as its parent", async () => {
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockParentExpense as never)
    vi.mocked(financialCategoryRepository.findByNameUnderParent).mockResolvedValue(null)
    vi.mocked(financialCategoryRepository.create).mockResolvedValue({ id: "cat-2" } as never)

    await financialCategoryService.create("ws-1", { name: "Sub", direction: "PAYABLE", parentId: "parent-1" })

    expect(financialCategoryRepository.create).toHaveBeenCalled()
  })

  it("rejects a parentId that does not exist in this workspace", async () => {
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(null)

    await expect(
      financialCategoryService.create("ws-1", { name: "Sub", direction: "PAYABLE", parentId: "missing" }),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_CATEGORY_NOT_FOUND })
  })

  it("rejects a duplicate name under the same parent", async () => {
    vi.mocked(financialCategoryRepository.findByNameUnderParent).mockResolvedValue({ id: "existing" } as never)

    await expect(
      financialCategoryService.create("ws-1", { name: "Marcenaria", direction: "PAYABLE" }),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_CATEGORY_NAME_TAKEN })
  })
})

describe("financialCategoryService.archive", () => {
  beforeEach(() => vi.clearAllMocks())

  it("archives a category with no active children", async () => {
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockParentExpense as never)
    vi.mocked(financialCategoryRepository.countChildren).mockResolvedValue(0)
    vi.mocked(entityLifecycleService.archive).mockImplementation(async (opts) => {
      if (opts.guard) await opts.guard()
    })

    await financialCategoryService.archive("parent-1", "ws-1", "user-1")

    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "FinancialCategory", id: "parent-1", workspaceId: "ws-1", userId: "user-1" }),
    )
  })

  it("blocks archiving (FINANCIAL_CATEGORY_HAS_CHILDREN) while active subcategories exist", async () => {
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockParentExpense as never)
    vi.mocked(financialCategoryRepository.countChildren).mockResolvedValue(2)
    vi.mocked(entityLifecycleService.archive).mockImplementation(async (opts) => {
      if (opts.guard) await opts.guard()
    })

    await expect(
      financialCategoryService.archive("parent-1", "ws-1", "user-1"),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_CATEGORY_HAS_CHILDREN })
  })
})
