import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financialDocument: { aggregate: vi.fn() },
    payment:           { aggregate: vi.fn() },
    bankAccount:       { aggregate: vi.fn() },
    installment:       { aggregate: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { financialDashboardService } from "@/modules/financial/services/financialDashboard.service"

const mocked = {
  financialDocument: vi.mocked(prisma.financialDocument),
  payment:           vi.mocked(prisma.payment),
  bankAccount:       vi.mocked(prisma.bankAccount),
  installment:       vi.mocked(prisma.installment),
}

describe("financialDashboardService.getWidgets", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Sensible zeroed defaults so each test only needs to override what it
    // actually cares about — the service issues 11 aggregate queries.
    mocked.financialDocument.aggregate.mockResolvedValue({ _sum: { totalAmountCents: null } } as never)
    mocked.payment.aggregate.mockResolvedValue({ _sum: { amountCents: null } } as never)
    mocked.bankAccount.aggregate.mockResolvedValue({ _sum: { initialBalanceCents: null } } as never)
    mocked.installment.aggregate.mockResolvedValue({ _sum: { amountCents: null }, _count: 0 } as never)
  })

  it("defaults every figure to 0n when there is no data yet (new workspace)", async () => {
    const result = await financialDashboardService.getWidgets("ws-1")

    expect(result.revenueExpectedCents).toBe(0n)
    expect(result.revenueReceivedCents).toBe(0n)
    expect(result.expensesExpectedCents).toBe(0n)
    expect(result.expensesRealizedCents).toBe(0n)
    expect(result.balanceCents).toBe(0n)
    expect(result.cashFlowCents).toBe(0n)
    expect(result.overdue.receivable).toEqual({ count: 0, amountCents: 0n })
  })

  it("computes balanceCents as initialBalance + all-time received - all-time paid", async () => {
    mocked.bankAccount.aggregate.mockResolvedValue({ _sum: { initialBalanceCents: 500_000n } } as never)
    // Two of the four payment.aggregate calls are "all-time" (no paidAt
    // filter): call order in the service is
    // [revenueReceived(month), expensesRealized(month), allTimeReceived, allTimePaid]
    mocked.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 100_000n } } as never) // revenueReceived (this month)
      .mockResolvedValueOnce({ _sum: { amountCents: 40_000n } } as never)  // expensesRealized (this month)
      .mockResolvedValueOnce({ _sum: { amountCents: 300_000n } } as never) // allTimeReceived
      .mockResolvedValueOnce({ _sum: { amountCents: 120_000n } } as never) // allTimePaid

    const result = await financialDashboardService.getWidgets("ws-1")

    expect(result.balanceCents).toBe(680_000n) // 500,000 + 300,000 - 120,000
    expect(result.revenueReceivedCents).toBe(100_000n)
    expect(result.expensesRealizedCents).toBe(40_000n)
    expect(result.cashFlowCents).toBe(60_000n) // 100,000 - 40,000
  })

  it("filters Payment aggregates by the denormalized direction field directly (RC-2.5) — no nested relation filter", async () => {
    await financialDashboardService.getWidgets("ws-1")

    for (const call of mocked.payment.aggregate.mock.calls) {
      const where = call[0]!.where
      expect(where).toHaveProperty("direction")
      expect(where).not.toHaveProperty("installment")
    }
  })

  it("handles balances well beyond the old Int32 ceiling correctly", async () => {
    mocked.bankAccount.aggregate.mockResolvedValue({ _sum: { initialBalanceCents: 3_000_000_000n } } as never)

    const result = await financialDashboardService.getWidgets("ws-1")

    expect(result.balanceCents).toBe(3_000_000_000n)
  })

  it("passes business-timezone month boundaries (not server-local) to the competency/paidAt filters", async () => {
    await financialDashboardService.getWidgets("ws-1")

    const firstCall = mocked.financialDocument.aggregate.mock.calls[0]!
    const competencyFilter = firstCall[0]!.where?.competencyDate as { gte: Date; lte: Date }
    expect(competencyFilter.gte).toBeInstanceOf(Date)
    expect(competencyFilter.lte).toBeInstanceOf(Date)
    // Boundaries must fall exactly on Brazil-local midnight (03:00 UTC start,
    // 02:59:59.999 UTC end) — see dateOnly.test.ts for the full boundary matrix.
    expect(competencyFilter.gte.getUTCHours()).toBe(3)
    expect(competencyFilter.gte.getUTCDate()).toBe(1)
  })
})
