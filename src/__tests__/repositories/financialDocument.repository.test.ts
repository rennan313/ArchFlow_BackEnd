import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Same inline-mock convention as installment.repository.test.ts — see that
// file's header comment for why the factory can't reference an outer const.
vi.mock("@/lib/prisma", () => {
  const mock = {
    financialDocument: { create: vi.fn(), findFirstOrThrow: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    installment: { createMany: vi.fn() },
    payment: { count: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})

import { prisma } from "@/lib/prisma"
import { financialDocumentRepository } from "@/repositories/financialDocument.repository"

const mockPrisma = prisma as unknown as {
  financialDocument: { create: ReturnType<typeof vi.fn>; findFirstOrThrow: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
  installment: { createMany: ReturnType<typeof vi.fn> }
  payment: { count: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

const baseInput = {
  workspaceId: "ws-1",
  direction: "PAYABLE" as const,
  categoryId: "cat-1",
  description: "Test document",
  competencyDate: new Date("2026-01-01"),
  createdByUserId: "user-1",
}

describe("financialDocumentRepository.createWithInstallments", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sums installment amounts (BigInt) into totalAmountCents rather than trusting a client-supplied total", async () => {
    mockPrisma.financialDocument.create.mockResolvedValue({ id: "doc-1" })
    mockPrisma.financialDocument.findFirstOrThrow.mockResolvedValue({ id: "doc-1", totalAmountCents: 15_000n })

    await financialDocumentRepository.createWithInstallments({
      ...baseInput,
      installments: [{ amountCents: 5_000n, dueDate: new Date() }, { amountCents: 10_000n, dueDate: new Date() }],
    })

    expect(mockPrisma.financialDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ totalAmountCents: 15_000n }),
    })
  })

  it("numbers installments sequentially from 1 and links each to the created document", async () => {
    mockPrisma.financialDocument.create.mockResolvedValue({ id: "doc-1" })
    mockPrisma.financialDocument.findFirstOrThrow.mockResolvedValue({ id: "doc-1" })

    await financialDocumentRepository.createWithInstallments({
      ...baseInput,
      installments: [{ amountCents: 1_000n, dueDate: new Date("2026-02-01") }, { amountCents: 2_000n, dueDate: new Date("2026-03-01") }, { amountCents: 3_000n, dueDate: new Date("2026-04-01") }],
    })

    expect(mockPrisma.installment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ financialDocumentId: "doc-1", number: 1, amountCents: 1_000n }),
        expect.objectContaining({ financialDocumentId: "doc-1", number: 2, amountCents: 2_000n }),
        expect.objectContaining({ financialDocumentId: "doc-1", number: 3, amountCents: 3_000n }),
      ],
    })
  })

  it("handles a single-installment document (the common case) without special-casing", async () => {
    mockPrisma.financialDocument.create.mockResolvedValue({ id: "doc-1" })
    mockPrisma.financialDocument.findFirstOrThrow.mockResolvedValue({ id: "doc-1", totalAmountCents: 500n })

    await financialDocumentRepository.createWithInstallments({ ...baseInput, installments: [{ amountCents: 500n, dueDate: new Date() }] })

    expect(mockPrisma.financialDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({ totalAmountCents: 500n }) })
    expect(mockPrisma.installment.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ number: 1 })] })
  })
})

describe("financialDocumentRepository.cancelIfNoPayments", () => {
  beforeEach(() => vi.clearAllMocks())

  it("refuses to cancel and reports hadPayments when the document already has at least one payment", async () => {
    mockPrisma.payment.count.mockResolvedValue(3)

    const result = await financialDocumentRepository.cancelIfNoPayments("doc-1", "ws-1")

    expect(result).toEqual({ cancelled: false, hadPayments: true })
    expect(mockPrisma.financialDocument.updateMany).not.toHaveBeenCalled()
  })

  it("cancels and bumps version when there are no payments", async () => {
    mockPrisma.payment.count.mockResolvedValue(0)
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 1 })

    const result = await financialDocumentRepository.cancelIfNoPayments("doc-1", "ws-1")

    expect(result).toEqual({ cancelled: true, hadPayments: false })
    expect(mockPrisma.financialDocument.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", workspaceId: "ws-1", isCancelled: false },
      data: { isCancelled: true, version: { increment: 1 } },
    })
  })

  // RC-3.1 — the mocked half of the guard proof: if the document was
  // already cancelled by a concurrent transaction between this function's
  // paymentCount check and its own write, the conditional `isCancelled:
  // false` in the where-clause matches nothing and this must report
  // cancelled: false rather than lying that it succeeded.
  it("reports cancelled: false (not an error) when the document was already cancelled by a concurrent writer", async () => {
    mockPrisma.payment.count.mockResolvedValue(0)
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 0 })

    const result = await financialDocumentRepository.cancelIfNoPayments("doc-1", "ws-1")

    expect(result).toEqual({ cancelled: false, hadPayments: false })
  })
})

describe("financialDocumentRepository.existsForProject / existsForClient", () => {
  beforeEach(() => vi.clearAllMocks())

  it("existsForProject returns true only when the workspace-scoped count is positive", async () => {
    mockPrisma.financialDocument.count.mockResolvedValue(2)
    await expect(financialDocumentRepository.existsForProject("proj-1", "ws-1")).resolves.toBe(true)
    expect(mockPrisma.financialDocument.count).toHaveBeenCalledWith({ where: { projectId: "proj-1", workspaceId: "ws-1" } })
  })

  it("existsForProject returns false when there is no financial history", async () => {
    mockPrisma.financialDocument.count.mockResolvedValue(0)
    await expect(financialDocumentRepository.existsForProject("proj-1", "ws-1")).resolves.toBe(false)
  })

  it("existsForClient is scoped by workspaceId the same way", async () => {
    mockPrisma.financialDocument.count.mockResolvedValue(1)
    await expect(financialDocumentRepository.existsForClient("client-1", "ws-1")).resolves.toBe(true)
    expect(mockPrisma.financialDocument.count).toHaveBeenCalledWith({ where: { clientId: "client-1", workspaceId: "ws-1" } })
  })
})
