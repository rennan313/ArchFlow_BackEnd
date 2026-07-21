import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Same inline-mock convention as purchaseOrder.repository.test.ts (and the
// pre-V3 timeEntry.repository.test.ts) — the mock object itself stands in
// for `tx`, since $transaction's fake just invokes the callback with it.
vi.mock("@/lib/prisma", () => {
  const mock = {
    workSession: { create: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), updateMany: vi.fn() },
    timeEntry:   { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})

import { prisma } from "@/lib/prisma"
import { workSessionRepository } from "@/repositories/workSession.repository"

const mockPrisma = prisma as unknown as {
  workSession: {
    create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>
    findFirstOrThrow: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>
  }
  timeEntry: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

const baseStartInput = { workspaceId: "ws-1", userId: "user-1", isBillable: true }

describe("workSessionRepository.start — ADR-024", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a RUNNING session and its first OPEN Step in one call", async () => {
    mockPrisma.workSession.create.mockResolvedValue({ id: "ws-1", status: "RUNNING", activeOwnerId: "user-1" })
    mockPrisma.timeEntry.create.mockResolvedValue({ id: "step-1", status: "OPEN", workSessionId: "ws-1" })

    await workSessionRepository.start(baseStartInput)

    expect(mockPrisma.workSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "RUNNING", activeOwnerId: "user-1", pausedAccumSec: 0 }),
    }))
    expect(mockPrisma.timeEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workSessionId: "ws-1", status: "OPEN", source: "TIMER" }),
    }))
  })

  it("on a unique-constraint violation (another session already active for this user), throws TIMER_ALREADY_RUNNING", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("", { code: "P2002", clientVersion: "5" })
    mockPrisma.workSession.create.mockRejectedValue(p2002)
    mockPrisma.workSession.findFirst.mockResolvedValue({ id: "ws-active", status: "RUNNING" })
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "step-active", status: "OPEN" })

    await expect(workSessionRepository.start(baseStartInput)).rejects.toMatchObject({ code: ErrorCode.TIMER_ALREADY_RUNNING })
  })
})

describe("workSessionRepository.switchContext — \"+ Nova Atividade\" (ADR-024)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("closes the open Step and opens a new one, without touching the session's own clock", async () => {
    mockPrisma.workSession.findFirst.mockResolvedValue({ id: "ws-1", status: "RUNNING" })
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "step-1", status: "OPEN", startedAt: new Date(Date.now() - 30_000) })
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.timeEntry.create.mockResolvedValue({ id: "step-2", status: "OPEN" })

    await workSessionRepository.switchContext("ws-1", "user-1", { projectId: "proj-2" })

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "step-1", status: "OPEN" },
      data: expect.objectContaining({ status: "COMPLETED", endedAt: expect.any(Date), durationSeconds: expect.any(Number) }),
    })
    expect(mockPrisma.timeEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workSessionId: "ws-1", projectId: "proj-2", status: "OPEN" }),
    }))
    expect(mockPrisma.workSession.updateMany).not.toHaveBeenCalled()
  })

  it("throws TIMER_NOT_ACTIVE when the caller has no RUNNING session (e.g. it's PAUSED)", async () => {
    mockPrisma.workSession.findFirst.mockResolvedValue(null)

    await expect(workSessionRepository.switchContext("ws-1", "user-1", {})).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_ACTIVE })
  })
})

describe("workSessionRepository.pause — ADR-024", () => {
  beforeEach(() => vi.clearAllMocks())

  it("closes the open Step and folds the elapsed span into pausedAccumSec via CAS from RUNNING", async () => {
    const lastResumedAt = new Date(Date.now() - 90_000) // 90s ago
    mockPrisma.workSession.findFirst.mockResolvedValue({ id: "ws-1", status: "RUNNING", lastResumedAt, pausedAccumSec: 30 })
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "step-1", status: "OPEN", startedAt: lastResumedAt })
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.workSession.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.workSession.findFirstOrThrow.mockResolvedValue({ id: "ws-1", status: "PAUSED" })

    await workSessionRepository.pause("ws-1", "user-1")

    expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "step-1", status: "OPEN" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    })
    const call = mockPrisma.workSession.updateMany.mock.calls[0][0]
    expect(call.data.status).toBe("PAUSED")
    expect(call.data.lastResumedAt).toBeNull()
    // 30 (already accumulated) + ~90 (this span) — allow scheduling jitter.
    expect(call.data.pausedAccumSec).toBeGreaterThanOrEqual(119)
    expect(call.data.pausedAccumSec).toBeLessThanOrEqual(121)
  })

  it("throws TIMER_NOT_ACTIVE when the caller has no RUNNING session", async () => {
    mockPrisma.workSession.findFirst.mockResolvedValue(null)

    await expect(workSessionRepository.pause("ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_ACTIVE })
  })
})

describe("workSessionRepository.resume — ADR-024", () => {
  beforeEach(() => vi.clearAllMocks())

  it("CAS only matches PAUSED, resets lastResumedAt, and opens a fresh blank Step", async () => {
    mockPrisma.workSession.findFirst.mockResolvedValue({ id: "ws-1", status: "PAUSED" })
    mockPrisma.workSession.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.workSession.findFirstOrThrow.mockResolvedValue({ id: "ws-1", status: "RUNNING" })
    mockPrisma.timeEntry.create.mockResolvedValue({ id: "step-new", status: "OPEN" })

    await workSessionRepository.resume("ws-1", "user-1")

    expect(mockPrisma.workSession.updateMany).toHaveBeenCalledWith({
      where: { id: "ws-1", status: "PAUSED" },
      data: { status: "RUNNING", lastResumedAt: expect.any(Date) },
    })
    const stepCall = mockPrisma.timeEntry.create.mock.calls[0][0]
    expect(stepCall.data).toMatchObject({ workSessionId: "ws-1", status: "OPEN" })
    expect(stepCall.data.projectId).toBeUndefined()
    expect(stepCall.data.categoryId).toBeUndefined()
  })

  it("throws TIMER_NOT_PAUSED when the caller has no PAUSED session", async () => {
    mockPrisma.workSession.findFirst.mockResolvedValue(null)

    await expect(workSessionRepository.resume("ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_PAUSED })
  })
})

describe("workSessionRepository.finish — ADR-024 / DP5", () => {
  beforeEach(() => vi.clearAllMocks())

  it("from RUNNING: closes the open Step, durationSeconds = pausedAccumSec + final span, clears activeOwnerId", async () => {
    const lastResumedAt = new Date(Date.now() - 60_000) // 60s ago
    mockPrisma.workSession.findFirst.mockResolvedValue({ id: "ws-1", status: "RUNNING", lastResumedAt, pausedAccumSec: 120 })
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "step-1", status: "OPEN", startedAt: lastResumedAt })
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.workSession.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.workSession.findFirstOrThrow.mockResolvedValue({ id: "ws-1", status: "COMPLETED" })

    await workSessionRepository.finish("ws-1", "user-1")

    const call = mockPrisma.workSession.updateMany.mock.calls[0][0]
    expect(call.data.status).toBe("COMPLETED")
    expect(call.data.activeOwnerId).toBeNull()
    expect(call.data.durationSeconds).toBeGreaterThanOrEqual(179) // 120 + ~60
    expect(call.data.durationSeconds).toBeLessThanOrEqual(181)
  })

  it("from PAUSED: endedAt is the last closed Step's own endedAt, not the instant of the call (DP5)", async () => {
    const lastStepEndedAt = new Date(Date.now() - 5 * 60_000) // finished 5 min ago
    mockPrisma.workSession.findFirst.mockResolvedValue({ id: "ws-1", status: "PAUSED", pausedAccumSec: 300 })
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: "step-1", status: "COMPLETED", endedAt: lastStepEndedAt })
    mockPrisma.workSession.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.workSession.findFirstOrThrow.mockResolvedValue({ id: "ws-1", status: "COMPLETED" })

    await workSessionRepository.finish("ws-1", "user-1")

    expect(mockPrisma.workSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ durationSeconds: 300, endedAt: lastStepEndedAt }),
    }))
  })

  it("throws TIMER_NOT_ACTIVE when the caller has no active session at all", async () => {
    mockPrisma.workSession.findFirst.mockResolvedValue(null)

    await expect(workSessionRepository.finish("ws-1", "user-1")).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_ACTIVE })
  })
})
