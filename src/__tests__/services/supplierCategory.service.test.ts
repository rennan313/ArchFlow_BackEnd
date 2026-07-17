import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/supplierCategory.repository")
vi.mock("@/services/entityLifecycle.service")

import { supplierCategoryService } from "@/modules/financial/services/supplierCategory.service"
import { supplierCategoryRepository } from "@/repositories/supplierCategory.repository"
import { entityLifecycleService } from "@/services/entityLifecycle.service"

const mockCategory = { id: "cat-1", workspaceId: "ws-1", name: "Marcenaria", archived: false }

describe("supplierCategoryService", () => {
  beforeEach(() => vi.clearAllMocks())

  it("create rejects a duplicate name in the workspace", async () => {
    vi.mocked(supplierCategoryRepository.findByName).mockResolvedValue(mockCategory as never)

    await expect(
      supplierCategoryService.create("ws-1", { name: "Marcenaria" }),
    ).rejects.toMatchObject({ code: ErrorCode.SUPPLIER_CATEGORY_NAME_TAKEN })
    expect(supplierCategoryRepository.create).not.toHaveBeenCalled()
  })

  it("create succeeds with a unique name", async () => {
    vi.mocked(supplierCategoryRepository.findByName).mockResolvedValue(null)
    vi.mocked(supplierCategoryRepository.create).mockResolvedValue(mockCategory as never)

    await supplierCategoryService.create("ws-1", { name: "Marcenaria" })
    expect(supplierCategoryRepository.create).toHaveBeenCalledWith({ workspaceId: "ws-1", name: "Marcenaria" })
  })

  it("getById throws NOT_FOUND for a category outside the workspace", async () => {
    vi.mocked(supplierCategoryRepository.findById).mockResolvedValue(null)
    await expect(supplierCategoryService.getById("cat-1", "ws-1")).rejects.toMatchObject({ code: ErrorCode.SUPPLIER_CATEGORY_NOT_FOUND })
  })

  it("update allows renaming to the same name it already has (excludes self from the conflict check)", async () => {
    vi.mocked(supplierCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(supplierCategoryRepository.findByName).mockResolvedValue(mockCategory as never) // finds itself
    vi.mocked(supplierCategoryRepository.update).mockResolvedValue({ count: 1 } as never)

    await supplierCategoryService.update("cat-1", "ws-1", { name: "Marcenaria" })
    expect(supplierCategoryRepository.update).toHaveBeenCalledWith("cat-1", "ws-1", { name: "Marcenaria" })
  })

  it("update rejects renaming to a name already used by a DIFFERENT category", async () => {
    vi.mocked(supplierCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(supplierCategoryRepository.findByName).mockResolvedValue({ id: "cat-2", name: "Marmoraria" } as never)

    await expect(
      supplierCategoryService.update("cat-1", "ws-1", { name: "Marmoraria" }),
    ).rejects.toMatchObject({ code: ErrorCode.SUPPLIER_CATEGORY_NAME_TAKEN })
  })

  it("archive is a soft update (ADR-020), never a physical delete", async () => {
    vi.mocked(supplierCategoryRepository.findById).mockResolvedValue(mockCategory as never)

    await supplierCategoryService.archive("cat-1", "ws-1", "user-1")
    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "SupplierCategory", id: "cat-1", workspaceId: "ws-1", userId: "user-1" }),
    )
  })
})
