import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Same inline-mock convention as purchaseOrder.repository.test.ts — the mock
// object itself stands in for `tx`, since $transaction's fake just invokes
// the callback with it. Mocked tests validate the CAS/idempotency LOGIC
// deterministically (by scripting updateMany's returned `count`), not real
// concurrency — real-concurrency verification is a throwaway
// scripts/rc-*-check.ts run against actual MongoDB, per
// ENGINEERING_STANDARDS.md §4.2, not a vitest concern.
vi.mock("@/lib/prisma", () => {
  const mock = {
    aiCreditBalance:     { findUnique: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    aiCreditLedgerEntry: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})

import { prisma } from "@/lib/prisma"
import { aiCreditRepository } from "@/repositories/aiCredit.repository"

const mockPrisma = prisma as unknown as {
  aiCreditBalance: {
    findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>
  }
  aiCreditLedgerEntry: {
    findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

describe("aiCreditRepository.debit", () => {
  beforeEach(() => vi.clearAllMocks())

  it("debits entirely from the PLAN bucket when it has enough balance — never touches PURCHASED", async () => {
    mockPrisma.aiCreditLedgerEntry.findMany.mockResolvedValue([]) // no prior idempotent entry
    mockPrisma.aiCreditBalance.findUnique.mockResolvedValueOnce({ balance: 10 }) // PLAN balance check
    mockPrisma.aiCreditBalance.updateMany.mockResolvedValueOnce({ count: 1 }) // PLAN CAS succeeds
    mockPrisma.aiCreditBalance.findUnique.mockResolvedValueOnce({ balance: 5 }) // PLAN balance after decrement
    mockPrisma.aiCreditLedgerEntry.create.mockResolvedValueOnce({ id: "ledger-plan-1" })

    const result = await aiCreditRepository.debit({ workspaceId: "ws-1", cost: 5, idempotencyKey: "op-1" })

    expect(result).toEqual({ success: true, ledgerEntryIds: ["ledger-plan-1"], planDebited: 5, purchasedDebited: 0 })
    expect(mockPrisma.aiCreditBalance.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", bucket: "PLAN", balance: { gte: 5 } },
      data: { balance: { decrement: 5 }, version: { increment: 1 } },
    })
    // Only one bucket touched — PURCHASED's updateMany never called.
    expect(mockPrisma.aiCreditBalance.updateMany).toHaveBeenCalledTimes(1)
  })

  it("splits the debit across PLAN (partial) then PURCHASED (remainder) when PLAN alone is insufficient", async () => {
    mockPrisma.aiCreditLedgerEntry.findMany.mockResolvedValue([])
    mockPrisma.aiCreditBalance.findUnique
      .mockResolvedValueOnce({ balance: 2 })   // PLAN balance check — only 2 available
      .mockResolvedValueOnce({ balance: 0 })   // PLAN balance after taking 2
      .mockResolvedValueOnce({ balance: 27 })  // PURCHASED balance after taking 3
    mockPrisma.aiCreditBalance.updateMany
      .mockResolvedValueOnce({ count: 1 }) // PLAN CAS (take 2)
      .mockResolvedValueOnce({ count: 1 }) // PURCHASED CAS (take remaining 3)
    mockPrisma.aiCreditLedgerEntry.create
      .mockResolvedValueOnce({ id: "ledger-plan-1" })
      .mockResolvedValueOnce({ id: "ledger-purchased-1" })

    const result = await aiCreditRepository.debit({ workspaceId: "ws-1", cost: 5, idempotencyKey: "op-2" })

    expect(result).toEqual({
      success: true, ledgerEntryIds: ["ledger-plan-1", "ledger-purchased-1"], planDebited: 2, purchasedDebited: 3,
    })
    expect(mockPrisma.aiCreditBalance.updateMany).toHaveBeenNthCalledWith(1, {
      where: { workspaceId: "ws-1", bucket: "PLAN", balance: { gte: 2 } },
      data: { balance: { decrement: 2 }, version: { increment: 1 } },
    })
    expect(mockPrisma.aiCreditBalance.updateMany).toHaveBeenNthCalledWith(2, {
      where: { workspaceId: "ws-1", bucket: "PURCHASED", balance: { gte: 3 } },
      data: { balance: { decrement: 3 }, version: { increment: 1 } },
    })
  })

  it("two concurrent debits racing the exact last credit: the loser's PURCHASED CAS misses (count 0) and the whole transaction rolls back — never a negative balance", async () => {
    mockPrisma.aiCreditLedgerEntry.findMany.mockResolvedValue([])
    mockPrisma.aiCreditBalance.findUnique.mockResolvedValueOnce({ balance: 0 }) // PLAN exhausted
    // PURCHASED CAS loses the race — the other concurrent caller already took the balance.
    mockPrisma.aiCreditBalance.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await aiCreditRepository.debit({ workspaceId: "ws-1", cost: 5, idempotencyKey: "op-3" })

    expect(result).toEqual({ success: false, ledgerEntryIds: [], planDebited: 0, purchasedDebited: 0 })
    // No ledger entry is ever written for the losing side — the CAS miss
    // throws before create() is reached, and the $transaction rolls back.
    expect(mockPrisma.aiCreditLedgerEntry.create).not.toHaveBeenCalled()
  })

  it("replays idempotently when a prior attempt with the same idempotencyKey already succeeded — never debits twice", async () => {
    mockPrisma.aiCreditLedgerEntry.findMany.mockResolvedValue([
      { id: "ledger-plan-1", bucket: "PLAN", amount: -5 },
    ])

    const result = await aiCreditRepository.debit({ workspaceId: "ws-1", cost: 5, idempotencyKey: "op-1" })

    expect(result).toEqual({ success: true, ledgerEntryIds: ["ledger-plan-1"], planDebited: 5, purchasedDebited: 0 })
    expect(mockPrisma.aiCreditBalance.updateMany).not.toHaveBeenCalled()
  })

  it("on a P2002 unique-constraint race on the ledger idempotency key, returns the winner instead of throwing", async () => {
    mockPrisma.aiCreditLedgerEntry.findMany
      .mockResolvedValueOnce([]) // pre-check inside the transaction: not found yet
      .mockResolvedValueOnce([{ id: "ledger-plan-1", bucket: "PLAN", amount: -5 }]) // post-catch re-fetch
    mockPrisma.aiCreditBalance.findUnique.mockResolvedValueOnce({ balance: 10 })
    const p2002 = new Prisma.PrismaClientKnownRequestError("", { code: "P2002", clientVersion: "5" })
    mockPrisma.aiCreditBalance.updateMany.mockRejectedValueOnce(p2002)

    const result = await aiCreditRepository.debit({ workspaceId: "ws-1", cost: 5, idempotencyKey: "op-1" })

    expect(result).toEqual({ success: true, ledgerEntryIds: ["ledger-plan-1"], planDebited: 5, purchasedDebited: 0 })
  })
})

describe("aiCreditRepository.grantCycle", () => {
  beforeEach(() => vi.clearAllMocks())

  it("is a no-op replay if this cycle was already granted (idempotent — safe for a cron to run twice)", async () => {
    mockPrisma.aiCreditLedgerEntry.findUnique.mockResolvedValue({ id: "grant-1", cycleKey: "sub_1:2026-08-01" })

    const result = await aiCreditRepository.grantCycle({
      workspaceId: "ws-1", amount: 20, cycleKey: "sub_1:2026-08-01", expiresAt: new Date("2026-09-01"),
    })

    expect(result).toEqual({ id: "grant-1", cycleKey: "sub_1:2026-08-01" })
    expect(mockPrisma.aiCreditBalance.upsert).not.toHaveBeenCalled()
  })

  it("grants the PLAN bucket and writes a GRANT_CYCLE ledger entry when not already granted", async () => {
    mockPrisma.aiCreditLedgerEntry.findUnique.mockResolvedValue(null)
    mockPrisma.aiCreditBalance.upsert.mockResolvedValue({ balance: 20 })
    mockPrisma.aiCreditLedgerEntry.create.mockResolvedValue({ id: "grant-1" })

    await aiCreditRepository.grantCycle({
      workspaceId: "ws-1", amount: 20, cycleKey: "sub_1:2026-08-01", expiresAt: new Date("2026-09-01"),
    })

    expect(mockPrisma.aiCreditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bucket: "PLAN", reason: "GRANT_CYCLE", amount: 20, cycleKey: "sub_1:2026-08-01" }),
    })
  })
})
