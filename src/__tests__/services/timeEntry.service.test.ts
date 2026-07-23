import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/timeEntry.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/lib/tenantGuard")
vi.mock("@/services/entityLifecycle.service")
vi.mock("@/lib/pagination", () => ({ buildMeta: vi.fn() }))

import { timeEntryService } from "@/modules/worklog/services/timeEntry.service"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { projectRepository } from "@/repositories/project.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { entityLifecycleService } from "@/services/entityLifecycle.service"

const mockEntry = {
  id: "te-1", workspaceId: "ws-1", userId: "user-1", status: "COMPLETED" as const,
}

describe("timeEntryService.createManual / update — tenant guard", () => {
  beforeEach(() => vi.clearAllMocks())

  it("validates every foreign reference belongs to the workspace before writing anything", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(timeEntryRepository.createManual).mockResolvedValue(mockEntry as never)
    // ADR-025 — createManual resolves clientId from the project when
    // projectId is present, so the project lookup needs a shape to resolve.
    vi.mocked(projectRepository.findById).mockResolvedValue({ clientId: "client-1" } as never)

    await timeEntryService.createManual("ws-1", "user-1", {
      projectId: "proj-1", clientId: "client-1", taskId: "task-1", categoryId: "cat-1",
      isBillable: true, startedAt: new Date(), endedAt: new Date(),
    } as never)

    expect(assertWorkspaceReferences).toHaveBeenCalledWith("ws-1", expect.objectContaining({
      projectId: "proj-1", clientId: "client-1", taskId: "task-1", activityCategoryId: "cat-1",
    }))
  })

  it("rejects an update with a projectId/taskId/categoryId belonging to another workspace before touching the repository", async () => {
    vi.mocked(assertWorkspaceReferences).mockRejectedValue(new AppError(ErrorCode.CROSS_TENANT_REFERENCE))

    await expect(
      timeEntryService.update("te-1", "ws-1", null, { projectId: "other-ws-project" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(timeEntryRepository.update).not.toHaveBeenCalled()
  })
})

describe("timeEntryService.update — scopedUserId (ADR-022)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("passes scopedUserId through to the repository so a non-privileged caller can only match their own entry", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(timeEntryRepository.update).mockResolvedValue({ count: 1 } as never)
    vi.mocked(timeEntryRepository.findById).mockResolvedValue(mockEntry as never)

    await timeEntryService.update("te-1", "ws-1", "user-1", { description: "novo" } as never)

    expect(timeEntryRepository.update).toHaveBeenCalledWith("te-1", "ws-1", "user-1", expect.anything())
  })

  it("throws TIME_ENTRY_NOT_EDITABLE (not NOT_FOUND) when the CAS matches zero rows but the entry exists — i.e. it belongs to someone else", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(timeEntryRepository.update).mockResolvedValue({ count: 0 } as never)
    vi.mocked(timeEntryRepository.findById).mockResolvedValue(mockEntry as never)

    await expect(
      timeEntryService.update("te-1", "ws-1", "someone-else", { description: "novo" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.TIME_ENTRY_NOT_EDITABLE })
  })

  it("throws TIME_ENTRY_NOT_FOUND when the CAS matches zero rows and the entry doesn't exist at all", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(timeEntryRepository.update).mockResolvedValue({ count: 0 } as never)
    vi.mocked(timeEntryRepository.findById).mockResolvedValue(null)

    await expect(
      timeEntryService.update("te-x", "ws-1", "user-1", { description: "novo" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.TIME_ENTRY_NOT_FOUND })
  })

  // Regression — the repository writes through prisma.timeEntry.updateMany(),
  // which only accepts scalar FK fields (projectId/categoryId/...), never a
  // nested `{ connect: { id } }`. A previous version of this method built a
  // `{ project: { connect } }`/`{ category: { connect } }` shape here, which
  // passed TypeScript (structural typing doesn't flag extra properties on a
  // non-literal) but made every edit that touched project/category throw a
  // PrismaClientValidationError at runtime — surfaced to the user as an
  // unconditional 500 on Save. Asserting the exact shape sent to the
  // repository is what would have caught it (the repository is mocked here,
  // so nothing exercises Prisma's own validation).
  it("sends scalar projectId/categoryId to the repository, never a nested connect object", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(projectRepository.findById).mockResolvedValue({ clientId: "client-1" } as never)
    vi.mocked(timeEntryRepository.update).mockResolvedValue({ count: 1 } as never)
    vi.mocked(timeEntryRepository.findById).mockResolvedValue(mockEntry as never)

    await timeEntryService.update("te-1", "ws-1", null, { projectId: "proj-1", categoryId: "cat-1" } as never)

    const data = vi.mocked(timeEntryRepository.update).mock.calls[0][3]
    expect(data).toEqual({ projectId: "proj-1", clientId: "client-1", categoryId: "cat-1" })
  })
})

describe("timeEntryService.bulkUpdate", () => {
  beforeEach(() => vi.clearAllMocks())

  // Same regression coverage as update() above — bulkUpdate() had the
  // identical `{ project: { connect } }` bug, also writing through
  // prisma.timeEntry.updateMany() via timeEntryRepository.bulkUpdate().
  it("sends scalar projectId/categoryId to the repository, never a nested connect object", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(projectRepository.findById).mockResolvedValue({ clientId: "client-1" } as never)
    vi.mocked(timeEntryRepository.bulkUpdate).mockResolvedValue({ count: 2 } as never)

    await timeEntryService.bulkUpdate(["te-1", "te-2"], "ws-1", null, { projectId: "proj-1", categoryId: "cat-1" } as never)

    const data = vi.mocked(timeEntryRepository.bulkUpdate).mock.calls[0][3]
    expect(data).toEqual({ projectId: "proj-1", clientId: "client-1", categoryId: "cat-1" })
  })
})

describe("timeEntryService.archive — active-timer guard + ownership", () => {
  beforeEach(() => vi.clearAllMocks())

  // ADR-024 — a Step is "active" (blocks archiving) while OPEN, the only
  // active state left on TimeEntry now that RUNNING/PAUSED moved to
  // WorkSession. switchContext()/pause()/finish() always close it first.
  it("blocks archiving (TIME_ENTRY_ACTIVE_CANNOT_ARCHIVE) while the Step is OPEN", async () => {
    vi.mocked(timeEntryRepository.findById).mockResolvedValue({ ...mockEntry, status: "OPEN" } as never)
    vi.mocked(entityLifecycleService.archive).mockImplementation(async (opts) => {
      if (opts.guard) await opts.guard()
    })

    await expect(
      timeEntryService.archive("te-1", "ws-1", "user-1", null),
    ).rejects.toMatchObject({ code: ErrorCode.TIME_ENTRY_ACTIVE_CANNOT_ARCHIVE })
  })

  it("archives a COMPLETED entry with no active-timer guard tripping", async () => {
    vi.mocked(timeEntryRepository.findById).mockResolvedValue(mockEntry as never)
    vi.mocked(entityLifecycleService.archive).mockResolvedValue(undefined as never)

    await timeEntryService.archive("te-1", "ws-1", "user-1", null)

    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "TimeEntry", id: "te-1", workspaceId: "ws-1", userId: "user-1" }),
    )
  })

  it("rejects archiving another user's entry (TIME_ENTRY_NOT_EDITABLE) when the caller is scoped to their own", async () => {
    vi.mocked(timeEntryRepository.findById).mockResolvedValue({ ...mockEntry, userId: "owner-1" } as never)

    await expect(
      timeEntryService.archive("te-1", "ws-1", "caller-1", "caller-1"),
    ).rejects.toMatchObject({ code: ErrorCode.TIME_ENTRY_NOT_EDITABLE })
    expect(entityLifecycleService.archive).not.toHaveBeenCalled()
  })
})

describe("timeEntryService.getById / restore — NOT_FOUND", () => {
  beforeEach(() => vi.clearAllMocks())

  it("getById throws TIME_ENTRY_NOT_FOUND for a missing/cross-tenant id", async () => {
    vi.mocked(timeEntryRepository.findById).mockResolvedValue(null)
    await expect(timeEntryService.getById("te-x", "ws-1")).rejects.toThrow(AppError)
  })

  it("restore() rejects another user's entry (TIME_ENTRY_NOT_EDITABLE) when the caller is scoped to their own", async () => {
    vi.mocked(timeEntryRepository.findById).mockResolvedValue({ ...mockEntry, userId: "owner-1" } as never)

    await expect(
      timeEntryService.restore("te-1", "ws-1", "caller-1", "caller-1"),
    ).rejects.toMatchObject({ code: ErrorCode.TIME_ENTRY_NOT_EDITABLE })
    expect(entityLifecycleService.restore).not.toHaveBeenCalled()
  })
})
