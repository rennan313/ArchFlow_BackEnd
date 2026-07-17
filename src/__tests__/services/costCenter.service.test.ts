import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/costCenter.repository")
vi.mock("@/services/entityLifecycle.service")

import { costCenterService } from "@/modules/financial/services/costCenter.service"
import { costCenterRepository } from "@/repositories/costCenter.repository"
import { entityLifecycleService } from "@/services/entityLifecycle.service"

const mockCostCenter = { id: "cc-1", workspaceId: "ws-1", name: "Obra Casa Verde", archived: false }

describe("costCenterService", () => {
  beforeEach(() => vi.clearAllMocks())

  it("create rejects a duplicate name in the workspace", async () => {
    vi.mocked(costCenterRepository.findByName).mockResolvedValue(mockCostCenter as never)
    await expect(costCenterService.create("ws-1", { name: "Obra Casa Verde" })).rejects.toMatchObject({ code: ErrorCode.COST_CENTER_NAME_TAKEN })
  })

  it("create succeeds with a unique name", async () => {
    vi.mocked(costCenterRepository.findByName).mockResolvedValue(null)
    vi.mocked(costCenterRepository.create).mockResolvedValue(mockCostCenter as never)
    await costCenterService.create("ws-1", { name: "Obra Casa Verde" })
    expect(costCenterRepository.create).toHaveBeenCalledWith({ workspaceId: "ws-1", name: "Obra Casa Verde" })
  })

  it("getById throws NOT_FOUND for a cost center outside the workspace", async () => {
    vi.mocked(costCenterRepository.findById).mockResolvedValue(null)
    await expect(costCenterService.getById("cc-1", "ws-1")).rejects.toMatchObject({ code: ErrorCode.COST_CENTER_NOT_FOUND })
  })

  it("update rejects renaming to a name used by a different cost center", async () => {
    vi.mocked(costCenterRepository.findById).mockResolvedValue(mockCostCenter as never)
    vi.mocked(costCenterRepository.findByName).mockResolvedValue({ id: "cc-2", name: "Outra Obra" } as never)
    await expect(costCenterService.update("cc-1", "ws-1", { name: "Outra Obra" })).rejects.toMatchObject({ code: ErrorCode.COST_CENTER_NAME_TAKEN })
  })

  it("archive is a soft update (ADR-020), never a physical delete", async () => {
    vi.mocked(costCenterRepository.findById).mockResolvedValue(mockCostCenter as never)
    await costCenterService.archive("cc-1", "ws-1", "user-1")
    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "CostCenter", id: "cc-1", workspaceId: "ws-1", userId: "user-1" }),
    )
  })

  it("list delegates to the repository with the archived flag", async () => {
    vi.mocked(costCenterRepository.findMany).mockResolvedValue([mockCostCenter] as never)
    await costCenterService.list("ws-1", true)
    expect(costCenterRepository.findMany).toHaveBeenCalledWith("ws-1", true)
  })
})
