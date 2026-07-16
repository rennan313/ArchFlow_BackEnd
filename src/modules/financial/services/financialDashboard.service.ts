import { prisma } from "@/lib/prisma"
import { add, subtract, zero, type Cents } from "@/lib/money"
import { startOfBusinessMonth, endOfBusinessMonth } from "@/lib/dateOnly"
import { timed } from "@/lib/metrics"

// Same "raw prisma aggregation inside a dashboard-facing service" exception
// dashboard.service.ts already documents for getAggregations/getKanbanWidgets
// — this is a cross-cutting read spanning FinancialDocument/Installment/
// Payment/BankAccount that doesn't belong to any single repository.
//
// RC-2.5: every Payment aggregate below filters on Payment.direction
// directly — a denormalized copy of FinancialDocument.direction (see the
// schema comment on Payment.direction for why this is safe to denormalize).
// Before RC-2.5 these queries filtered through
// `installment: { financialDocument: { direction } } }`, a 2-hop relation
// filter that compiles to a MongoDB $lookup and does not benefit from any
// index the way a direct field match does. The compound index
// `@@index([workspaceId, direction, paidAt])` on Payment now covers these
// directly.
//
// No materialized/pre-aggregated rollup here — still deliberately out of
// scope (see docs/financial-architecture.md "RC-2.5 — Dashboard scaling
// strategy" for the documented migration trigger and target design). This
// file is the place that would be replaced by reads against that rollup.

const OVERDUE_LOOKAHEAD_DAYS = 7
// Not `as const` — Prisma's `status: { in: [...] }` wants a mutable
// InstallmentStatus[], a readonly tuple doesn't satisfy that.
const OPEN_STATUSES: ("OPEN" | "PARTIAL")[] = ["OPEN", "PARTIAL"]

export const financialDashboardService = {
  getWidgets(workspaceId: string) {
    // RC-3.5 — this is the single most aggregate-heavy read in the module
    // (11 parallel aggregates), and the first candidate for the materialized-
    // rollup migration documented above once this timing shows it's needed.
    return timed("financial.dashboard.getWidgets", () => financialDashboardService.computeWidgets(workspaceId))
  },

  async computeWidgets(workspaceId: string) {
    const now        = new Date()
    const monthStart = startOfBusinessMonth(now)
    const monthEnd   = endOfBusinessMonth(now)
    const dueSoonEnd = new Date(now.getTime() + OVERDUE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)

    const [
      revenueExpected, expensesExpected,
      revenueReceived, expensesRealized,
      allTimeReceived, allTimePaid, bankAccountBalances,
      overdueReceivable, overduePayable,
      dueSoonReceivable, dueSoonPayable,
    ] = await Promise.all([
      // Receita/despesa prevista do mês — total value of installments whose
      // parent document falls in this competência month, regardless of
      // payment status.
      prisma.financialDocument.aggregate({
        where: { workspaceId, direction: "RECEIVABLE", isCancelled: false, competencyDate: { gte: monthStart, lte: monthEnd } },
        _sum: { totalAmountCents: true },
      }),
      prisma.financialDocument.aggregate({
        where: { workspaceId, direction: "PAYABLE", isCancelled: false, competencyDate: { gte: monthStart, lte: monthEnd } },
        _sum: { totalAmountCents: true },
      }),
      // Receita/despesa realizada do mês — actual Payments posted this month.
      prisma.payment.aggregate({
        where: { workspaceId, direction: "RECEIVABLE", paidAt: { gte: monthStart, lte: monthEnd } },
        _sum: { amountCents: true },
      }),
      prisma.payment.aggregate({
        where: { workspaceId, direction: "PAYABLE", paidAt: { gte: monthStart, lte: monthEnd } },
        _sum: { amountCents: true },
      }),
      // Saldo — current cash position across every active bank account:
      // sum(initialBalanceCents) + all-time RECEIVABLE payments - all-time
      // PAYABLE payments. Never stored, see BankAccount.initialBalanceCents.
      prisma.payment.aggregate({
        where: { workspaceId, direction: "RECEIVABLE" },
        _sum: { amountCents: true },
      }),
      prisma.payment.aggregate({
        where: { workspaceId, direction: "PAYABLE" },
        _sum: { amountCents: true },
      }),
      prisma.bankAccount.aggregate({ where: { workspaceId, isActive: true }, _sum: { initialBalanceCents: true } }),
      // Contas vencidas — open/partial installments past due.
      prisma.installment.aggregate({
        where: { workspaceId, status: { in: OPEN_STATUSES }, dueDate: { lt: now }, financialDocument: { direction: "RECEIVABLE", isCancelled: false } },
        _sum: { amountCents: true }, _count: true,
      }),
      prisma.installment.aggregate({
        where: { workspaceId, status: { in: OPEN_STATUSES }, dueDate: { lt: now }, financialDocument: { direction: "PAYABLE", isCancelled: false } },
        _sum: { amountCents: true }, _count: true,
      }),
      // Contas a vencer — open/partial installments due within the lookahead window.
      prisma.installment.aggregate({
        where: { workspaceId, status: { in: OPEN_STATUSES }, dueDate: { gte: now, lte: dueSoonEnd }, financialDocument: { direction: "RECEIVABLE", isCancelled: false } },
        _sum: { amountCents: true }, _count: true,
      }),
      prisma.installment.aggregate({
        where: { workspaceId, status: { in: OPEN_STATUSES }, dueDate: { gte: now, lte: dueSoonEnd }, financialDocument: { direction: "PAYABLE", isCancelled: false } },
        _sum: { amountCents: true }, _count: true,
      }),
    ])

    const zeroCents = (v: Cents | null | undefined): Cents => v ?? zero()

    const receivedThisMonthCents = zeroCents(revenueReceived._sum.amountCents)
    const paidThisMonthCents     = zeroCents(expensesRealized._sum.amountCents)

    const balanceCents = subtract(
      add(zeroCents(bankAccountBalances._sum.initialBalanceCents), zeroCents(allTimeReceived._sum.amountCents)),
      zeroCents(allTimePaid._sum.amountCents),
    )

    return {
      period: { monthStart, monthEnd },
      revenueExpectedCents:  zeroCents(revenueExpected._sum.totalAmountCents),
      revenueReceivedCents:  receivedThisMonthCents,
      expensesExpectedCents: zeroCents(expensesExpected._sum.totalAmountCents),
      expensesRealizedCents: paidThisMonthCents,
      balanceCents,
      cashFlowCents: subtract(receivedThisMonthCents, paidThisMonthCents),
      overdue: {
        receivable: { count: overdueReceivable._count, amountCents: zeroCents(overdueReceivable._sum.amountCents) },
        payable:    { count: overduePayable._count,    amountCents: zeroCents(overduePayable._sum.amountCents) },
      },
      dueSoon: {
        lookaheadDays: OVERDUE_LOOKAHEAD_DAYS,
        receivable: { count: dueSoonReceivable._count, amountCents: zeroCents(dueSoonReceivable._sum.amountCents) },
        payable:    { count: dueSoonPayable._count,    amountCents: zeroCents(dueSoonPayable._sum.amountCents) },
      },
    }
  },
}
