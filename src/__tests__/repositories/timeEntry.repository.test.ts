import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Same inline-mock convention as purchaseOrder.repository.test.ts — the mock
// object itself stands in for `tx`, since $transaction's fake just invokes
// the callback with it.
vi.mock("@/lib/prisma", () => {
  const mock = {
    timeEntry: { create: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})

import { prisma } from "@/lib/prisma"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"

const mockPrisma = prisma as unknown as {
  timeEntry: {
    create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; findFirstOrThrow: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

const baseStartInput = { workspaceId: "ws-1", userId: "user-1", isBillable: true }

describe("timeEntryRepository.start", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a RUNNING entry with activeOwnerId set to the caller", async () => {
    mockPrisma.timeEntry.create.mockResolvedValue({ id: "te-1", status: "RUNNING", activeOwnerId: "user-1" })

    await timeEntryRepository.start(baseStartInput)

    expect(mockPrisma.timeEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "RUNNING", source: "TIMER", activeOwnerId: "user-1", pausedAccumSec: 0 }),
    }))
  })

  it("on a unique-constraint violation (another timer already active for this user), throws TIMER_ALREADY_RUNNING carrying the active entry", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("", { code: "P2002", clientVersion: "5" })
    mockPrisma.timeEntry.create.mockRejectedValue(p2002)
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "te-active", status: "RUNNING" })

    await expect(timeEntryRepository.start(baseStartInput)).rejects.toMatchObject({ code: ErrorCode.TIMER_ALREADY_RUNNING })
    // Recovery re-fetches via the (workspaceId, userId, status IN [...]) read path — never by activeOwnerId
    // alone, since that field has no read-side index of its own (only the write-side sparse unique index).
    expect(mockPrisma.timeEntry.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", userId: "user-1", status: { in: ["RUNNING", "PAUSED"] } },
      include: expect.anything(),
    })
  })

  it("two concurrent start() calls for the same user: the second's P2002 is rejected, never silently treated as success", async () => {
    // Simulates the real race this ADR-021 protects against: both calls reach create()
    // "at the same time" in this mock, but only one succeeds — the second sees P2002.
    mockPrisma.timeEntry.create
      .mockResolvedValueOnce({ id: "te-1", status: "RUNNING" })
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("", { code: "P2002", clientVersion: "5" }))
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "te-1", status: "RUNNING" })

    const first = await timeEntryRepository.start(baseStartInput)
    expect(first).toEqual({ id: "te-1", status: "RUNNING" })

    await expect(timeEntryRepository.start(baseStartInput)).rejects.toMatchObject({ code: ErrorCode.TIMER_ALREADY_RUNNING })
  })
})

describe("timeEntryRepository.pause", () => {
  beforeEach(() => vi.clearAllMocks())

  it("folds the elapsed running span (now - lastResumedAt) into pausedAccumSec via CAS from RUNNING", async () => {
    const lastResumedAt = new Date(Date.now() - 90_000) // 90s ago
    mockPrisma.timeEntry.findFirst.mockResolvedValueOnce({ id: "te-1", status: "RUNNING", lastResumedAt, pausedAccumSec: 30 })
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.timeEntry.findFirstOrThrow.mockResolvedValue({ id: "te-1", status: "PAUSED" })

    await timeEntryRepository.pause("te-1", "ws-1", "user-1")

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "te-1", workspaceId: "ws-1", userId: "user-1", status: "RUNNING" },
      data: expect.objectContaining({ status: "PAUSED", pausedAccumSec: expect.any(Number), lastResumedAt: null }),
    })
    const call = mockPrisma.timeEntry.updateMany.mock.calls[0][0]
    // 30 (already accumulated) + ~90 (this span) — allow scheduling jitter.
    expect(call.data.pausedAccumSec).toBeGreaterThanOrEqual(119)
    expect(call.data.pausedAccumSec).toBeLessThanOrEqual(121)
  })

  it("throws TIME_ENTRY_NOT_FOUND when the entry doesn't exist in this workspace at all", async () => {
    mockPrisma.timeEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    await expect(timeEntryRepository.pause("te-x", "ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIME_ENTRY_NOT_FOUND })
  })

  it("throws TIMER_NOT_ACTIVE when the entry exists but isn't RUNNING (e.g. already PAUSED or COMPLETED)", async () => {
    mockPrisma.timeEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "te-1", status: "COMPLETED" })

    await expect(timeEntryRepository.pause("te-1", "ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_ACTIVE })
  })
})

describe("timeEntryRepository.resume", () => {
  beforeEach(() => vi.clearAllMocks())

  it("CAS only matches PAUSED — resets lastResumedAt to a fresh timestamp", async () => {
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.timeEntry.findFirstOrThrow.mockResolvedValue({ id: "te-1", status: "RUNNING" })

    await timeEntryRepository.resume("te-1", "ws-1", "user-1")

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "te-1", workspaceId: "ws-1", userId: "user-1", status: "PAUSED" },
      data: { status: "RUNNING", lastResumedAt: expect.any(Date) },
    })
  })

  it("throws TIMER_NOT_PAUSED on CAS-miss against a RUNNING entry", async () => {
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "te-1", status: "RUNNING" })

    await expect(timeEntryRepository.resume("te-1", "ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_PAUSED })
  })
})

describe("timeEntryRepository.stop", () => {
  beforeEach(() => vi.clearAllMocks())

  it("from RUNNING: durationSeconds = pausedAccumSec + the final running span, and clears activeOwnerId", async () => {
    const lastResumedAt = new Date(Date.now() - 60_000) // 60s ago
    mockPrisma.timeEntry.findFirst.mockResolvedValueOnce({ id: "te-1", status: "RUNNING", lastResumedAt, pausedAccumSec: 120 })
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.timeEntry.findFirstOrThrow.mockResolvedValue({ id: "te-1", status: "COMPLETED" })

    await timeEntryRepository.stop("te-1", "ws-1", "user-1")

    const call = mockPrisma.timeEntry.updateMany.mock.calls[0][0]
    expect(call.data.status).toBe("COMPLETED")
    expect(call.data.activeOwnerId).toBeNull()
    expect(call.data.durationSeconds).toBeGreaterThanOrEqual(179) // 120 + ~60
    expect(call.data.durationSeconds).toBeLessThanOrEqual(181)
  })

  it("from PAUSED: durationSeconds is exactly pausedAccumSec, no extra span added", async () => {
    mockPrisma.timeEntry.findFirst.mockResolvedValueOnce({ id: "te-1", status: "PAUSED", lastResumedAt: null, pausedAccumSec: 300 })
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.timeEntry.findFirstOrThrow.mockResolvedValue({ id: "te-1", status: "COMPLETED" })

    await timeEntryRepository.stop("te-1", "ws-1", "user-1")

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ durationSeconds: 300 }),
    }))
  })

  it("throws TIME_ENTRY_NOT_FOUND when the entry doesn't exist in this workspace", async () => {
    mockPrisma.timeEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    await expect(timeEntryRepository.stop("te-x", "ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIME_ENTRY_NOT_FOUND })
  })

  it("throws TIMER_NOT_ACTIVE when the entry is already COMPLETED", async () => {
    mockPrisma.timeEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "te-1", status: "COMPLETED" })

    await expect(timeEntryRepository.stop("te-1", "ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_ACTIVE })
  })
})

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
