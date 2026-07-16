import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financialDocument: { aggregate: vi.fn(), findMany: vi.fn() },
    payment:           { aggregate: vi.fn() },
  },
}))
vi.mock("@/lib/tenantGuard")

import { prisma } from "@/lib/prisma"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { projectFinancialSummaryService } from "@/modules/financial/services/projectFinancialSummary.service"

const mocked = {
  financialDocument: vi.mocked(prisma.financialDocument),
  payment:           vi.mocked(prisma.payment),
}

describe("projectFinancialSummaryService.getSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    mocked.financialDocument.aggregate.mockResolvedValue({ _sum: { totalAmountCents: null } } as never)
    mocked.payment.aggregate.mockResolvedValue({ _sum: { amountCents: null } } as never)
    mocked.financialDocument.findMany.mockResolvedValue([])
  })

  it("validates the project belongs to the workspace before querying anything", async () => {
    await projectFinancialSummaryService.getSummary("proj-1", "ws-1")
    expect(assertWorkspaceReferences).toHaveBeenCalledWith("ws-1", { projectId: "proj-1" })
  })

  it("balanceCents is realized cash (received - realized), directMarginCents is the contracted figure (expected - expected) — the two must never be conflated", async () => {
    mocked.financialDocument.aggregate
      .mockResolvedValueOnce({ _sum: { totalAmountCents: 500_000n } } as never) // revenueExpected
      .mockResolvedValueOnce({ _sum: { totalAmountCents: 300_000n } } as never) // expensesExpected
    mocked.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 100_000n } } as never) // revenueReceived
      .mockResolvedValueOnce({ _sum: { amountCents: 250_000n } } as never) // expensesRealized

    const result = await projectFinancialSummaryService.getSummary("proj-1", "ws-1")

    expect(result.balanceCents).toBe(-150_000n)       // 100,000 - 250,000 (cash so far: negative, spent ahead of receipts)
    expect(result.directMarginCents).toBe(200_000n)    // 500,000 - 300,000 (contracted margin: positive)
  })

  it("deduplicates suppliers across multiple financial documents for the same project", async () => {
    mocked.financialDocument.findMany.mockResolvedValue([
      { supplier: { id: "sup-1", name: "Marcenaria Ipê" } },
      { supplier: { id: "sup-2", name: "Vidraçaria Sol" } },
    ] as never)

    const result = await projectFinancialSummaryService.getSummary("proj-1", "ws-1")

    expect(result.suppliers).toEqual([
      { id: "sup-1", name: "Marcenaria Ipê" },
      { id: "sup-2", name: "Vidraçaria Sol" },
    ])
    expect(mocked.financialDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ["supplierId"] }),
    )
  })

  it("defaults every figure to 0n for a project with no financial activity yet", async () => {
    const result = await projectFinancialSummaryService.getSummary("proj-1", "ws-1")

    expect(result.revenueExpectedCents).toBe(0n)
    expect(result.expensesRealizedCents).toBe(0n)
    expect(result.balanceCents).toBe(0n)
    expect(result.directMarginCents).toBe(0n)
    expect(result.suppliers).toEqual([])
  })

  // RC-3.3 — locks in the fix: filtering Payment.projectId directly measured
  // ~140ms vs ~30s for the old installment.financialDocument.projectId
  // $lookup at 100k payments (docs/financial-architecture.md §6). A future
  // edit reintroducing the nested lookup here would silently reopen that
  // regression — this test exists so it fails loudly instead.
  it("filters Payment by the denormalized projectId field directly, not a nested installment.financialDocument lookup", async () => {
    await projectFinancialSummaryService.getSummary("proj-1", "ws-1")

    expect(mocked.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "proj-1" }) }),
    )
    for (const call of mocked.payment.aggregate.mock.calls) {
      expect(call[0].where).not.toHaveProperty("installment")
    }
  })
})
