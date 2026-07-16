import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/supplier.repository")
vi.mock("@/lib/tenantGuard")

import { supplierService } from "@/modules/financial/services/supplier.service"
import { supplierRepository } from "@/repositories/supplier.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"

const mockSupplier = { id: "sup-1", workspaceId: "ws-1", name: "Marcenaria Ipê", categoryId: "cat-1", isActive: true }

describe("supplierService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
  })

  it("create validates the category belongs to the workspace before writing", async () => {
    vi.mocked(supplierRepository.create).mockResolvedValue(mockSupplier as never)

    await supplierService.create("ws-1", { name: "Marcenaria Ipê", categoryId: "cat-1" } as never)

    expect(assertWorkspaceReferences).toHaveBeenCalledWith("ws-1", { supplierCategoryId: "cat-1" })
  })

  it("getById throws NOT_FOUND for a supplier outside the workspace", async () => {
    vi.mocked(supplierRepository.findById).mockResolvedValue(null)
    await expect(supplierService.getById("sup-1", "ws-1")).rejects.toMatchObject({ code: ErrorCode.SUPPLIER_NOT_FOUND })
  })

  it("projects delegates to the repository after confirming the supplier exists", async () => {
    vi.mocked(supplierRepository.findById).mockResolvedValue(mockSupplier as never)
    vi.mocked(supplierRepository.findProjects).mockResolvedValue([{ id: "proj-1", name: "Casa Verde" }] as never)

    const result = await supplierService.projects("sup-1", "ws-1")

    expect(result).toEqual([{ id: "proj-1", name: "Casa Verde" }])
  })

  it("update re-validates categoryId only when it's actually being changed", async () => {
    vi.mocked(supplierRepository.findById).mockResolvedValue(mockSupplier as never)
    vi.mocked(supplierRepository.update).mockResolvedValue({ count: 1 } as never)

    await supplierService.update("sup-1", "ws-1", { name: "Novo Nome" } as never)

    expect(assertWorkspaceReferences).not.toHaveBeenCalled()
  })

  it("deactivate is a soft update (isActive: false), never a physical delete", async () => {
    vi.mocked(supplierRepository.findById).mockResolvedValue(mockSupplier as never)

    await supplierService.deactivate("sup-1", "ws-1")

    expect(supplierRepository.update).toHaveBeenCalledWith("sup-1", "ws-1", { isActive: false })
  })
})
