import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/bankAccount.repository")
vi.mock("@/services/entityLifecycle.service")

import { bankAccountService } from "@/modules/financial/services/bankAccount.service"
import { bankAccountRepository } from "@/repositories/bankAccount.repository"
import { entityLifecycleService } from "@/services/entityLifecycle.service"

const mockAccount = { id: "acc-1", workspaceId: "ws-1", name: "Conta Principal", initialBalanceCents: 500_000n, archived: false }

describe("bankAccountService.create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("converts initialBalance from reais to BigInt cents via the money library", async () => {
    vi.mocked(bankAccountRepository.create).mockResolvedValue(mockAccount as never)

    await bankAccountService.create("ws-1", { name: "Conta Principal", bankName: "Banco Inter", type: "CHECKING", initialBalance: 5000 })

    expect(bankAccountRepository.create).toHaveBeenCalledWith(expect.objectContaining({ initialBalanceCents: 500_000n }))
  })

  it("supports a negative initial balance (overdraft is a legitimate starting state)", async () => {
    vi.mocked(bankAccountRepository.create).mockResolvedValue(mockAccount as never)

    await bankAccountService.create("ws-1", { name: "Conta Principal", bankName: "Banco Inter", type: "CHECKING", initialBalance: -1000 })

    expect(bankAccountRepository.create).toHaveBeenCalledWith(expect.objectContaining({ initialBalanceCents: -100_000n }))
  })
})

describe("bankAccountService.getById / getWithBalance", () => {
  beforeEach(() => vi.clearAllMocks())

  it("getById throws NOT_FOUND for an account outside the workspace", async () => {
    vi.mocked(bankAccountRepository.findById).mockResolvedValue(null)
    await expect(bankAccountService.getById("acc-1", "ws-1")).rejects.toMatchObject({ code: ErrorCode.BANK_ACCOUNT_NOT_FOUND })
  })

  it("getWithBalance nets RECEIVABLE (add) and PAYABLE (subtract) grouped sums against the initial balance", async () => {
    vi.mocked(bankAccountRepository.findById).mockResolvedValue(mockAccount as never)
    vi.mocked(bankAccountRepository.findPaymentSumsByDirection).mockResolvedValue([
      { direction: "RECEIVABLE", _sum: { amountCents: 200_000n } },
      { direction: "PAYABLE", _sum: { amountCents: 80_000n } },
    ] as never)

    const result = await bankAccountService.getWithBalance("acc-1", "ws-1")

    expect(result.currentBalanceCents).toBe(620_000n) // 500,000 + 200,000 - 80,000
  })

  it("getWithBalance handles a direction with no payments yet (null sum) without throwing", async () => {
    vi.mocked(bankAccountRepository.findById).mockResolvedValue(mockAccount as never)
    vi.mocked(bankAccountRepository.findPaymentSumsByDirection).mockResolvedValue([] as never)

    const result = await bankAccountService.getWithBalance("acc-1", "ws-1")

    expect(result.currentBalanceCents).toBe(500_000n)
  })

  it("list computes currentBalanceCents per account", async () => {
    vi.mocked(bankAccountRepository.findMany).mockResolvedValue([mockAccount] as never)
    vi.mocked(bankAccountRepository.findPaymentSumsByDirection).mockResolvedValue([
      { direction: "PAYABLE", _sum: { amountCents: 50_000n } },
    ] as never)

    const result = await bankAccountService.list("ws-1", false)

    expect(result[0].currentBalanceCents).toBe(450_000n)
  })
})

describe("bankAccountService.deactivate", () => {
  beforeEach(() => vi.clearAllMocks())

  it("is a soft archive (ADR-020), never a physical delete", async () => {
    vi.mocked(bankAccountRepository.findById).mockResolvedValue(mockAccount as never)
    await bankAccountService.deactivate("acc-1", "ws-1", "user-1")
    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "BankAccount", id: "acc-1", workspaceId: "ws-1", userId: "user-1" }),
    )
  })
})
