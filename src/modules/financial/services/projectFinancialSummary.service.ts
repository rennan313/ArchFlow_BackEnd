import { prisma } from "@/lib/prisma"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { subtract, zero, type Cents } from "@/lib/money"
import { timed } from "@/lib/metrics"

// Same cross-cutting-aggregate exception as financialDashboard.service.ts —
// this reads across FinancialDocument/Payment/Supplier for a single project,
// which doesn't belong to any one repository.
//
// RC-3.3: the Payment queries below filter `projectId` directly — denormalized
// onto Payment the same way `direction` was in RC-2.5 (see the schema
// comment on Payment.projectId). This used to go through
// `installment: { financialDocument: { projectId } } }`, a $lookup that
// measured at ~30s at just 100k payments in a workspace
// (scripts/rc3-perf-check.ts, see docs/financial-architecture.md §6) — not
// a marginal cost, a page that would time out. The flat-field equivalent
// measured ~140ms at the same scale.

export const projectFinancialSummaryService = {
  getSummary(projectId: string, workspaceId: string) {
    return timed("financial.projectSummary.getSummary", () => projectFinancialSummaryService.computeSummary(projectId, workspaceId))
  },

  async computeSummary(projectId: string, workspaceId: string) {
    await assertWorkspaceReferences(workspaceId, { projectId })

    const [revenueExpected, expensesExpected, revenueReceived, expensesRealized, supplierRows] = await Promise.all([
      prisma.financialDocument.aggregate({
        where: { workspaceId, projectId, direction: "RECEIVABLE", isCancelled: false },
        _sum: { totalAmountCents: true },
      }),
      prisma.financialDocument.aggregate({
        where: { workspaceId, projectId, direction: "PAYABLE", isCancelled: false },
        _sum: { totalAmountCents: true },
      }),
      prisma.payment.aggregate({
        where: { workspaceId, direction: "RECEIVABLE", projectId },
        _sum: { amountCents: true },
      }),
      prisma.payment.aggregate({
        where: { workspaceId, direction: "PAYABLE", projectId },
        _sum: { amountCents: true },
      }),
      prisma.financialDocument.findMany({
        where: { workspaceId, projectId, direction: "PAYABLE", isCancelled: false, supplierId: { not: null } },
        select: { supplier: { select: { id: true, name: true } } },
        distinct: ["supplierId"],
      }),
    ])

    const zeroCents = (v: Cents | null | undefined): Cents => v ?? zero()

    const revenueExpectedCents  = zeroCents(revenueExpected._sum.totalAmountCents)
    const expensesExpectedCents = zeroCents(expensesExpected._sum.totalAmountCents)
    const revenueReceivedCents  = zeroCents(revenueReceived._sum.amountCents)
    const expensesRealizedCents = zeroCents(expensesRealized._sum.amountCents)

    return {
      revenueExpectedCents,
      revenueReceivedCents,
      expensesExpectedCents,
      expensesRealizedCents,
      // Actual cash net so far for this project — receita recebida menos
      // despesa realizada, not the contracted figure.
      balanceCents: subtract(revenueReceivedCents, expensesRealizedCents),
      // Contracted/budgeted margin (receita prevista - despesa prevista).
      // Deliberately "direta": no indirect/overhead cost allocation (rent,
      // fixed payroll) is applied here — rateio de despesas is out of scope
      // for this MVP. Never label this "lucro" in the UI without qualifying it.
      directMarginCents: subtract(revenueExpectedCents, expensesExpectedCents),
      suppliers: supplierRows.map((r) => r.supplier).filter((s): s is { id: string; name: string } => s !== null),
    }
  },
}
