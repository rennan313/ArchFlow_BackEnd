import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock("@/lib/prisma", () => {
  const mock = {
    timeEntry: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})

import { prisma } from "@/lib/prisma"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"

const mockPrisma = prisma as unknown as {
  timeEntry: {
    create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

// Start/pause/resume/finish moved to workSession.repository.ts (ADR-024) —
// see workSession.repository.test.ts for that CAS coverage.

describe("timeEntryRepository.update — ownership scoping (ADR-022)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("scopedUserId narrows the where clause to that user (defense in depth, mirrors financialCategory.repository.ts RC-3.7)", async () => {
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })

    await timeEntryRepository.update("te-1", "ws-1", "user-1", { description: "x" })

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "te-1", workspaceId: "ws-1", userId: "user-1" },
      data: { description: "x" },
    })
  })

  it("scopedUserId=null (caller has view:time-entries) omits the userId filter entirely", async () => {
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })

    await timeEntryRepository.update("te-1", "ws-1", null, { description: "x" })

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "te-1", workspaceId: "ws-1" },
      data: { description: "x" },
    })
  })
})

describe("timeEntryRepository.findPending — ADR-026", () => {
  beforeEach(() => vi.clearAllMocks())

  it("filters to closed entries missing projectId or categoryId, never OPEN Steps", async () => {
    mockPrisma.timeEntry.findMany.mockResolvedValue([])
    mockPrisma.timeEntry.count.mockResolvedValue(0)

    await timeEntryRepository.findPending("ws-1", "user-1", 1, 50)

    const call = mockPrisma.timeEntry.findMany.mock.calls[0][0]
    expect(call.where).toEqual({
      workspaceId: "ws-1", archived: false, status: "COMPLETED", userId: "user-1",
      OR: [{ projectId: null }, { categoryId: null }],
    })
  })

  it("scopedUserId=null (caller has view:time-entries) omits the userId filter", async () => {
    mockPrisma.timeEntry.findMany.mockResolvedValue([])
    mockPrisma.timeEntry.count.mockResolvedValue(0)

    await timeEntryRepository.findPending("ws-1", null, 1, 50)

    const call = mockPrisma.timeEntry.findMany.mock.calls[0][0]
    expect(call.where.userId).toBeUndefined()
  })
})

describe("timeEntryRepository.bulkUpdate — ADR-026", () => {
  beforeEach(() => vi.clearAllMocks())

  it("scopes the updateMany to the given ids + workspace, and to the caller when scoped", async () => {
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 2 })

    await timeEntryRepository.bulkUpdate(["te-1", "te-2"], "ws-1", "user-1", { isBillable: true })

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["te-1", "te-2"] }, workspaceId: "ws-1", userId: "user-1" },
      data: { isBillable: true },
    })
  })
})
