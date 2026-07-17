import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/activityCategory.repository")
vi.mock("@/services/entityLifecycle.service")

import { activityCategoryService } from "@/modules/worklog/services/activityCategory.service"
import { activityCategoryRepository } from "@/repositories/activityCategory.repository"
import { entityLifecycleService } from "@/services/entityLifecycle.service"

const mockCategory = { id: "cat-1", workspaceId: "ws-1", name: "Reunião", isDefault: false }

describe("activityCategoryService.create — name uniqueness", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a category with a unique name", async () => {
    vi.mocked(activityCategoryRepository.findByName).mockResolvedValue(null)
    vi.mocked(activityCategoryRepository.create).mockResolvedValue(mockCategory as never)

    await activityCategoryService.create("ws-1", { name: "Reunião" } as never)

    expect(activityCategoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", name: "Reunião", isDefault: false }),
    )
  })

  it("rejects a duplicate name in the same workspace (ACTIVITY_CATEGORY_NAME_TAKEN)", async () => {
    vi.mocked(activityCategoryRepository.findByName).mockResolvedValue(mockCategory as never)

    await expect(
      activityCategoryService.create("ws-1", { name: "Reunião" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.ACTIVITY_CATEGORY_NAME_TAKEN })
    expect(activityCategoryRepository.create).not.toHaveBeenCalled()
  })
})

describe("activityCategoryService.update — name uniqueness excludes self", () => {
  beforeEach(() => vi.clearAllMocks())

  it("allows renaming a category to its own current name (self-match excluded)", async () => {
    vi.mocked(activityCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(activityCategoryRepository.findByName).mockResolvedValue(mockCategory as never)
    vi.mocked(activityCategoryRepository.update).mockResolvedValue({ count: 1 } as never)

    await activityCategoryService.update("cat-1", "ws-1", { name: "Reunião" } as never)

    expect(activityCategoryRepository.update).toHaveBeenCalled()
  })

  it("rejects renaming to a name already used by a different category", async () => {
    vi.mocked(activityCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(activityCategoryRepository.findByName).mockResolvedValue({ id: "cat-2" } as never)

    await expect(
      activityCategoryService.update("cat-1", "ws-1", { name: "Obra" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.ACTIVITY_CATEGORY_NAME_TAKEN })
    expect(activityCategoryRepository.update).not.toHaveBeenCalled()
  })
})

describe("activityCategoryService.archive / restore — tenant scoping via entityLifecycleService", () => {
  beforeEach(() => vi.clearAllMocks())

  it("archive() throws ACTIVITY_CATEGORY_NOT_FOUND for a missing/cross-tenant id, before calling entityLifecycleService", async () => {
    vi.mocked(activityCategoryRepository.findById).mockResolvedValue(null)

    await expect(activityCategoryService.archive("cat-x", "ws-1", "user-1")).rejects.toMatchObject({
      code: ErrorCode.ACTIVITY_CATEGORY_NOT_FOUND,
    })
    expect(entityLifecycleService.archive).not.toHaveBeenCalled()
  })

  it("archive() delegates to entityLifecycleService scoped to this workspace, with no children guard", async () => {
    vi.mocked(activityCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(entityLifecycleService.archive).mockResolvedValue(undefined as never)

    await activityCategoryService.archive("cat-1", "ws-1", "user-1")

    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "ActivityCategory", id: "cat-1", workspaceId: "ws-1", userId: "user-1" }),
    )
  })

  it("restore() delegates to entityLifecycleService and returns the restored category", async () => {
    vi.mocked(entityLifecycleService.restore).mockResolvedValue(undefined as never)
    vi.mocked(activityCategoryRepository.findById).mockResolvedValue(mockCategory as never)

    const result = await activityCategoryService.restore("cat-1", "ws-1", "user-1")

    expect(entityLifecycleService.restore).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "ActivityCategory", id: "cat-1", workspaceId: "ws-1", userId: "user-1" }),
    )
    expect(result).toEqual(mockCategory)
  })
})

describe("activityCategoryService.getById — NOT_FOUND", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws ACTIVITY_CATEGORY_NOT_FOUND for a missing/cross-tenant id", async () => {
    vi.mocked(activityCategoryRepository.findById).mockResolvedValue(null)
    await expect(activityCategoryService.getById("cat-x", "ws-1")).rejects.toThrow(AppError)
  })
})
