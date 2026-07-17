import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const bankAccountRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.bankAccount.findFirst({ where: { id, workspaceId } })
  },

  findMany(workspaceId: string, archived: boolean) {
    return prisma.bankAccount.findMany({
      where: { workspaceId, archived },
      orderBy: { name: "asc" },
    })
  },

  create(data: Prisma.BankAccountUncheckedCreateInput) {
    return prisma.bankAccount.create({ data })
  },

  update(id: string, workspaceId: string, data: Prisma.BankAccountUpdateInput) {
    return prisma.bankAccount.updateMany({ where: { id, workspaceId }, data })
  },

  // Sum of every Payment ever posted against this account, grouped by
  // direction (RC-2.5: Payment.direction is denormalized, so this is a
  // direct grouped aggregate — no $lookup through Installment→
  // FinancialDocument, and no per-row fetch into Node memory regardless of
  // how many payments exist). The service layer nets this against
  // initialBalanceCents to derive the current balance — never stored, see
  // the schema comment on BankAccount.initialBalanceCents.
  //
  // RC-3.7 — workspaceId scoped directly here (not just relied on via the
  // caller's prior findById), consistent with every other query in this
  // domain — this is the one aggregate in the module that touches real
  // money sums, so it's the last place to make an exception.
  findPaymentSumsByDirection(bankAccountId: string, workspaceId: string) {
    return prisma.payment.groupBy({
      by: ["direction"],
      where: { bankAccountId, workspaceId },
      _sum: { amountCents: true },
    })
  },
}
