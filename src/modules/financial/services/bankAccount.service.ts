import { prisma } from "@/lib/prisma"
import { bankAccountRepository } from "@/repositories/bankAccount.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import { add, subtract, zero, reaisToCents, type Cents } from "@/lib/money"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import type { CreateBankAccountInput, UpdateBankAccountInput } from "@/validations/bankAccount"

// RECEIVABLE payments add to the account, PAYABLE payments subtract — the
// grouped sums from findPaymentSumsByDirection carry at most one row per
// direction (2 rows total), so this is cheap regardless of payment volume.
function netByDirectionSums(sums: { direction: "PAYABLE" | "RECEIVABLE"; _sum: { amountCents: Cents | null } }[]): Cents {
  return sums.reduce((net, s) => {
    const amount = s._sum.amountCents ?? zero()
    return s.direction === "RECEIVABLE" ? add(net, amount) : subtract(net, amount)
  }, zero())
}

export const bankAccountService = {
  // Includes currentBalanceCents per account — a workspace realistically has
  // a handful of bank accounts (not thousands), so the N-query fan-out this
  // does is not the same concern as the installment/dashboard lists (which
  // deliberately avoid per-row derived aggregates). Showing
  // initialBalanceCents here instead — a number that never changes after
  // creation — would silently mislead the one screen (Configurações
  // Financeiras) where a user checks "how much do I actually have."
  async list(workspaceId: string, archived: boolean) {
    const accounts = await bankAccountRepository.findMany(workspaceId, archived)
    return Promise.all(accounts.map(async (account) => {
      const sums = await bankAccountRepository.findPaymentSumsByDirection(account.id, workspaceId)
      return { ...account, currentBalanceCents: add(account.initialBalanceCents, netByDirectionSums(sums)) }
    }))
  },

  async getById(id: string, workspaceId: string) {
    const account = await bankAccountRepository.findById(id, workspaceId)
    if (!account) throw new AppError(ErrorCode.BANK_ACCOUNT_NOT_FOUND)
    return account
  },

  async getWithBalance(id: string, workspaceId: string) {
    const account = await this.getById(id, workspaceId)
    const sums    = await bankAccountRepository.findPaymentSumsByDirection(id, workspaceId)
    return { ...account, currentBalanceCents: add(account.initialBalanceCents, netByDirectionSums(sums)) }
  },

  async create(workspaceId: string, input: CreateBankAccountInput) {
    return bankAccountRepository.create({
      workspaceId,
      name:          input.name,
      bankName:      input.bankName,
      agency:        input.agency,
      accountNumber: input.accountNumber,
      type:          input.type,
      initialBalanceCents: reaisToCents(input.initialBalance),
    })
  },

  async update(id: string, workspaceId: string, input: UpdateBankAccountInput) {
    await this.getById(id, workspaceId)
    await bankAccountRepository.update(id, workspaceId, input)
    return this.getById(id, workspaceId)
  },

  // No physical delete — a bank account with payment history can never be
  // removed without breaking the ledger's audit trail. Archiving (ADR-020)
  // is the full lifecycle end-state, exactly as the brief specifies.
  async deactivate(id: string, workspaceId: string, userId: string) {
    await this.getById(id, workspaceId)
    await entityLifecycleService.archive({
      entity: "BankAccount", id, workspaceId, userId,
      delegate: prisma.bankAccount,
    })
  },

  async restore(id: string, workspaceId: string, userId: string) {
    await entityLifecycleService.restore({
      entity: "BankAccount", id, workspaceId, userId,
      delegate: prisma.bankAccount,
    })
    return this.getById(id, workspaceId)
  },
}
