import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Inline prisma mock — extends global setup with the Financial domain
// models. $transaction defaults to invoking the callback with the same
// mock object (so `tx.installment.findFirst` resolves to the exact mock as
// `prisma.installment.findFirst`), but individual tests override it with
// `mockRejectedValueOnce`/`mockImplementationOnce` to simulate the
// transaction itself failing (a transient conflict, or a duplicate-key
// violation on create) — see the RC-2.1/RC-2.4 describe blocks below.
// Built entirely inside the factory (not referencing an outer const) to
// avoid a TDZ error — vi.mock factories run before any module-scope const
// below them is initialized.
vi.mock("@/lib/prisma", () => {
  const mock = {
    installment: { findFirst: vi.fn(), update: vi.fn() },
    payment:     { create: vi.fn(), findUnique: vi.fn() },
    financialDocument: { updateMany: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})

import { prisma } from "@/lib/prisma"
import { installmentRepository } from "@/repositories/installment.repository"
import { AppError, ErrorCode } from "@/lib/errors"

const mockPrisma = prisma as unknown as {
  installment: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  payment: { create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
  financialDocument: { updateMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

function installmentWithPayments(amountCents: bigint, paidCents: bigint[], direction: "PAYABLE" | "RECEIVABLE" = "PAYABLE", projectId: string | null = "proj-1") {
  return {
    id: "inst-1",
    workspaceId: "ws-1",
    financialDocumentId: "doc-1",
    amountCents,
    payments: paidCents.map((amountCents, i) => ({ id: `pay-${i}`, amountCents })),
    financialDocument: { direction, projectId },
  }
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`idempotencyKey`)", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["idempotencyKey"] },
  })
}

const baseInput = {
  workspaceId: "ws-1",
  bankAccountId: "bank-1",
  paidAt: new Date("2026-01-10"),
  method: "PIX" as const,
  createdByUserId: "user-1",
  idempotencyKey: "11111111-1111-1111-1111-111111111111",
}

describe("installmentRepository.registerPayment — balance invariants (BigInt)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // RC-3.1 — every test in this file exercises the balance/idempotency/
    // retry logic, not the cancellation guard itself; default the guard-write
    // to "document is active" so those scenarios don't have to restate it.
    // The dedicated describe block below overrides this per-test.
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 1 })
  })

  it("registers a partial payment and moves status to PARTIAL", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, []))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 4_000n })

    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 4_000n })

    expect(mockPrisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCents: 4_000n, installmentId: "inst-1", direction: "PAYABLE", idempotencyKey: baseInput.idempotencyKey }),
    })
    expect(mockPrisma.installment.update).toHaveBeenCalledWith({
      where: { id: "inst-1" },
      data: { status: "PARTIAL" },
    })
  })

  it("moves status to PAID once payments cover the full amount", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, [4_000n]))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 6_000n })

    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 6_000n })

    expect(mockPrisma.installment.update).toHaveBeenCalledWith({
      where: { id: "inst-1" },
      data: { status: "PAID" },
    })
  })

  it("allows multiple payments against the same installment", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, [3_000n, 2_000n]))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 1_000n })

    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 1_000n })

    expect(mockPrisma.installment.update).toHaveBeenCalledWith({
      where: { id: "inst-1" },
      data: { status: "PARTIAL" }, // 3000+2000+1000 = 6000 of 10000, still short
    })
  })

  it("denormalizes direction from the parent FinancialDocument onto the Payment (RC-2.5)", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, [], "RECEIVABLE"))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 10_000n })

    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 10_000n })

    expect(mockPrisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ direction: "RECEIVABLE", projectId: "proj-1" }),
    })
  })

  // RC-3.3 — a document with no project (overhead expense: rent, payroll,
  // software) must denormalize projectId as null, not omit the field or
  // throw — the aggregate queries filtering on it (projectFinancialSummary)
  // never touch these rows anyway, but the write must still be well-formed.
  it("denormalizes projectId as null for a document with no project (overhead expense)", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, [], "PAYABLE", null))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 10_000n })

    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 10_000n })

    expect(mockPrisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: null }),
    })
  })

  it("handles amounts well beyond the old Int32 ceiling without truncation", async () => {
    const largeAmount = 3_000_000_000n // R$30,000,000.00 — exceeds Int32's ~2.147B cap
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(largeAmount, []))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: largeAmount })

    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: largeAmount })

    expect(mockPrisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCents: largeAmount }),
    })
    expect(mockPrisma.installment.update).toHaveBeenCalledWith({ where: { id: "inst-1" }, data: { status: "PAID" } })
  })

  it("rejects a payment that exceeds the remaining balance", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, [4_000n]))

    await expect(
      installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 7_000n }),
    ).rejects.toThrow(new AppError(ErrorCode.PAYMENT_EXCEEDS_REMAINING).message)

    expect(mockPrisma.payment.create).not.toHaveBeenCalled()
    expect(mockPrisma.installment.update).not.toHaveBeenCalled()
  })

  it("rejects any payment against an already fully paid installment", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, [10_000n]))

    await expect(
      installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 1n }),
    ).rejects.toThrow(new AppError(ErrorCode.INSTALLMENT_ALREADY_PAID).message)

    expect(mockPrisma.payment.create).not.toHaveBeenCalled()
  })

  it("throws INSTALLMENT_NOT_FOUND when the installment doesn't belong to the workspace", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(null)

    await expect(
      installmentRepository.registerPayment("missing", { ...baseInput, amountCents: 1_000n }),
    ).rejects.toThrow(new AppError(ErrorCode.INSTALLMENT_NOT_FOUND).message)
  })
})

// RC-2.1 — idempotency. These are the scenarios the audit explicitly asked
// to be provably fixed: retry, double-click racing past the frontend's
// disabled state, two tabs, refresh, timeout-then-resend. All of them boil
// down to "the same idempotencyKey reaches registerPayment more than once,
// possibly concurrently" — which is exactly what a P2002 on the unique
// index represents at this layer.
describe("installmentRepository.registerPayment — idempotency (RC-2.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // RC-3.1 — every test in this file exercises the balance/idempotency/
    // retry logic, not the cancellation guard itself; default the guard-write
    // to "document is active" so those scenarios don't have to restate it.
    // The dedicated describe block below overrides this per-test.
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 1 })
  })

  it("a concurrent duplicate (P2002 on idempotencyKey) returns the winning request's payment instead of erroring", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, []))
    mockPrisma.$transaction.mockRejectedValueOnce(p2002())
    const existingPayment = { id: "pay-existing", amountCents: 4_000n, idempotencyKey: baseInput.idempotencyKey }
    mockPrisma.payment.findUnique.mockResolvedValue(existingPayment)

    const result = await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 4_000n })

    expect(result).toEqual(existingPayment)
    expect(mockPrisma.payment.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: baseInput.idempotencyKey } })
  })

  it("re-throws a P2002 that is NOT actually a recoverable idempotency replay (no matching payment found)", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, []))
    mockPrisma.$transaction.mockRejectedValueOnce(p2002())
    mockPrisma.payment.findUnique.mockResolvedValue(null) // nothing found — genuinely unexpected

    await expect(
      installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 4_000n }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
  })

  // Regression test for a bug caught only by REAL concurrency testing
  // against MongoDB (not mocks) during RC-2 development: two concurrent
  // calls, same idempotencyKey. Call A commits. Call B loses the write
  // conflict on the shared Installment document, gets retried by
  // withTransactionRetry — and on that retry, re-reading a NOW-SMALLER
  // remaining balance (A's payment already landed) must NOT be
  // re-validated against the balance at all; the idempotencyKey check at
  // the top of the transaction body must short-circuit first and return
  // A's payment, or this would incorrectly throw PAYMENT_EXCEEDS_REMAINING
  // on a legitimate idempotent replay.
  it("on retry after a transient conflict, finds the payment its concurrent twin already committed and returns it — never re-validates the (now smaller) remaining balance", async () => {
    const transientError = new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock. Please retry your transaction", { code: "P2034", clientVersion: "test" })
    const siblingsPayment = { id: "pay-sibling", amountCents: 7_000n, idempotencyKey: baseInput.idempotencyKey }

    mockPrisma.$transaction
      .mockRejectedValueOnce(transientError)
      .mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(mockPrisma))
    // On the retry, the in-transaction idempotency check finds the sibling's
    // already-committed payment — installment.findFirst must NEVER be
    // reached on this attempt (no balance re-validation). *Once*, not a
    // persistent default — this must not leak into later tests in this file.
    mockPrisma.payment.findUnique.mockResolvedValueOnce(siblingsPayment)

    const result = await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 7_000n })

    expect(result).toEqual(siblingsPayment)
    expect(mockPrisma.installment.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.payment.create).not.toHaveBeenCalled()
  })

  it("a sequential retry with the same idempotencyKey and a SMALLER amount than the first (rejected) attempt still succeeds normally — the key isn't 'consumed' until a payment actually commits", async () => {
    // First attempt (amount too high) was rejected — nothing was created under this key.
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(1_000n, []))
    await expect(
      installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 5_000n }),
    ).rejects.toThrow(new AppError(ErrorCode.PAYMENT_EXCEEDS_REMAINING).message)
    expect(mockPrisma.payment.create).not.toHaveBeenCalled()

    // Corrected retry, same key, smaller amount — proceeds normally.
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 600n })
    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 600n })
    expect(mockPrisma.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amountCents: 600n, idempotencyKey: baseInput.idempotencyKey }) })
  })
})

// RC-2.4 — a losing write-conflict on the Installment document (real
// concurrency: two payments racing on the same installment) must be
// retried transparently, not surfaced as a raw 500.
describe("installmentRepository.registerPayment — transient conflict retry (RC-2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // RC-3.1 — every test in this file exercises the balance/idempotency/
    // retry logic, not the cancellation guard itself; default the guard-write
    // to "document is active" so those scenarios don't have to restate it.
    // The dedicated describe block below overrides this per-test.
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 1 })
  })

  it("retries once on a transient transaction conflict and succeeds", async () => {
    const transientError = new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock. Please retry your transaction", { code: "P2034", clientVersion: "test" })
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, []))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 1_000n })
    mockPrisma.$transaction
      .mockRejectedValueOnce(transientError)
      .mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(mockPrisma))

    const result = await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 1_000n })

    expect(result).toEqual({ id: "pay-new", amountCents: 1_000n })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
  })
})

// RC-3.1 — the cancellation-race guard. This is the mocked, deterministic
// half of the proof; scripts/rc3-concurrency-check.ts (run against real
// MongoDB, see docs/financial-architecture.md "RC-3.1") is the half that
// actually exercises MongoDB's write-conflict detection under real
// concurrency, which no mock can simulate.
describe("installmentRepository.registerPayment — cancellation guard (RC-3.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 1 })
  })

  it("rejects the payment when the parent document was cancelled between lookup and the guard-write", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, []))
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 0 }) // isCancelled: false matched nothing

    await expect(
      installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 4_000n }),
    ).rejects.toThrow(new AppError(ErrorCode.FINANCIAL_DOCUMENT_CANCELLED).message)

    expect(mockPrisma.financialDocument.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", workspaceId: "ws-1", isCancelled: false },
      data: { version: { increment: 1 } },
    })
    expect(mockPrisma.payment.create).not.toHaveBeenCalled()
    expect(mockPrisma.installment.update).not.toHaveBeenCalled()
  })

  it("proceeds normally when the guard-write matches (document still active)", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, []))
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-new", amountCents: 4_000n })

    await installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 4_000n })

    expect(mockPrisma.financialDocument.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", workspaceId: "ws-1", isCancelled: false },
      data: { version: { increment: 1 } },
    })
    expect(mockPrisma.payment.create).toHaveBeenCalled()
  })

  it("checks the guard-write BEFORE validating the remaining balance — a cancelled document is rejected even if the balance would otherwise allow the payment", async () => {
    mockPrisma.installment.findFirst.mockResolvedValue(installmentWithPayments(10_000n, [])) // plenty of remaining balance
    mockPrisma.financialDocument.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      installmentRepository.registerPayment("inst-1", { ...baseInput, amountCents: 1_000n }),
    ).rejects.toThrow(new AppError(ErrorCode.FINANCIAL_DOCUMENT_CANCELLED).message)
  })
})
