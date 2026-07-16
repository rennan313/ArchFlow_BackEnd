import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Same inline-mock convention as financialDocument.repository.test.ts / installment.repository.test.ts —
// the mock object itself stands in for `tx`, since $transaction's fake just invokes the callback with it.
vi.mock("@/lib/prisma", () => {
  const mock = {
    purchaseOrder:     { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    purchaseOrderItem: { createMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { prisma: mock }
})

// approve() composes financialDocumentRepository.createWithInstallments into
// its OWN transaction (ADR-017) — mocked as a module so we can assert it's
// called with the SAME tx object, never a fresh one of its own.
vi.mock("@/repositories/financialDocument.repository", () => ({
  financialDocumentRepository: { createWithInstallments: vi.fn() },
}))

import { prisma } from "@/lib/prisma"
import { purchaseOrderRepository } from "@/repositories/purchaseOrder.repository"
import { financialDocumentRepository } from "@/repositories/financialDocument.repository"

const mockPrisma = prisma as unknown as {
  purchaseOrder: {
    create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>
    findFirstOrThrow: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>
  }
  purchaseOrderItem: { createMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

const baseCreateInput = {
  workspaceId: "ws-1", supplierId: "sup-1", categoryId: "cat-1",
  description: "Cimento e areia", dueDate: new Date("2026-08-01"),
  createdByUserId: "user-1", idempotencyKey: "key-1",
  items: [{ description: "Cimento", quantity: 10, unitCents: 3_550n }],
}

describe("purchaseOrderRepository.create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("computes item.totalCents and totalAmountCents server-side rather than trusting any client-supplied total", async () => {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue(null)
    mockPrisma.purchaseOrder.create.mockResolvedValue({ id: "po-1" })
    mockPrisma.purchaseOrder.findFirstOrThrow.mockResolvedValue({ id: "po-1", totalAmountCents: 35_500n })

    await purchaseOrderRepository.create({
      ...baseCreateInput,
      items: [{ description: "Cimento", quantity: 10, unitCents: 3_550n }],
    })

    expect(mockPrisma.purchaseOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ totalAmountCents: 35_500n }),
    })
    expect(mockPrisma.purchaseOrderItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ totalCents: 35_500n, purchaseOrderId: "po-1" })],
    })
  })

  it("sums multiple items' totals correctly", async () => {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue(null)
    mockPrisma.purchaseOrder.create.mockResolvedValue({ id: "po-1" })
    mockPrisma.purchaseOrder.findFirstOrThrow.mockResolvedValue({ id: "po-1" })

    await purchaseOrderRepository.create({
      ...baseCreateInput,
      items: [{ description: "Cimento", quantity: 10, unitCents: 3_550n }, { description: "Areia", quantity: 2, unitCents: 10_000n }],
    })

    expect(mockPrisma.purchaseOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ totalAmountCents: 55_500n }),
    })
  })

  it("returns the existing order instead of creating a duplicate when the idempotencyKey pre-check inside the transaction finds a match", async () => {
    const existing = { id: "po-existing", idempotencyKey: "key-1" }
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue(existing)

    const result = await purchaseOrderRepository.create(baseCreateInput)

    expect(result).toBe(existing)
    expect(mockPrisma.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it("on a P2002 unique-constraint race (two concurrent creates with the same key), returns the winner instead of throwing", async () => {
    mockPrisma.purchaseOrder.findUnique
      .mockResolvedValueOnce(null) // pre-check inside the transaction: not found yet
      .mockResolvedValueOnce({ id: "po-winner", idempotencyKey: "key-1" }) // post-catch re-fetch by findByIdempotencyKey
    const p2002 = new Prisma.PrismaClientKnownRequestError("", { code: "P2002", clientVersion: "5" })
    mockPrisma.purchaseOrder.create.mockRejectedValue(p2002)

    const result = await purchaseOrderRepository.create(baseCreateInput)

    expect(result).toEqual({ id: "po-winner", idempotencyKey: "key-1" })
  })
})

describe("purchaseOrderRepository.approve", () => {
  beforeEach(() => vi.clearAllMocks())

  it("performs the CAS updateMany with the DRAFT precondition before creating the FinancialDocument", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.purchaseOrder.findFirstOrThrow.mockResolvedValue({
      id: "po-1", supplierId: "sup-1", categoryId: "cat-1", projectId: null, costCenterId: null,
      description: "Cimento", notes: null, totalAmountCents: 35_500n, dueDate: new Date("2026-08-01"),
    })
    vi.mocked(financialDocumentRepository.createWithInstallments).mockResolvedValue({ id: "doc-1" } as never)
    mockPrisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", status: "APPROVED", financialDocumentId: "doc-1" })

    await purchaseOrderRepository.approve("po-1", "ws-1", "user-1")

    expect(mockPrisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "po-1", workspaceId: "ws-1", status: "DRAFT" },
      data: { status: "APPROVED", version: { increment: 1 } },
    })
  })

  it("composes financialDocumentRepository.createWithInstallments into ITS OWN transaction — passes the same tx, never opens a second $transaction", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 })
    const po = {
      id: "po-1", supplierId: "sup-1", categoryId: "cat-1", projectId: null, costCenterId: null,
      description: "Cimento", notes: null, totalAmountCents: 35_500n, dueDate: new Date("2026-08-01"),
    }
    mockPrisma.purchaseOrder.findFirstOrThrow.mockResolvedValue(po)
    vi.mocked(financialDocumentRepository.createWithInstallments).mockResolvedValue({ id: "doc-1" } as never)
    mockPrisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", status: "APPROVED", financialDocumentId: "doc-1" })

    await purchaseOrderRepository.approve("po-1", "ws-1", "user-1")

    // The 3rd positional arg (db) must be the SAME object $transaction's fake handed back — i.e. `prisma` itself in this mock.
    expect(financialDocumentRepository.createWithInstallments).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "PAYABLE", supplierId: "sup-1", installments: [{ amountCents: 35_500n, dueDate: po.dueDate }] }),
      expect.anything(),
      mockPrisma,
    )
    // Only ONE $transaction call for the whole approve() — not one for the CAS and a separate one for the document.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it("on CAS-miss against an order this exact call already approved (idempotent replay), returns success instead of throwing", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "APPROVED", financialDocumentId: "doc-1" })
    mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({ id: "po-1", status: "APPROVED", financialDocumentId: "doc-1" })
    // approve()'s replay path fetches the linked FinancialDocument directly via tx.financialDocument — not exercised by this
    // mock shape (financialDocument isn't in the mocked prisma object here), so assert only on the non-throwing contract:
    // the repository must not blow up trying to read a field that doesn't exist on the mock.
    ;(mockPrisma as unknown as { financialDocument: { findUnique: ReturnType<typeof vi.fn> } }).financialDocument = { findUnique: vi.fn().mockResolvedValue({ id: "doc-1" }) }

    const result = await purchaseOrderRepository.approve("po-1", "ws-1", "user-1")

    expect(result).toEqual({ purchaseOrder: { id: "po-1", status: "APPROVED", financialDocumentId: "doc-1" }, financialDocument: { id: "doc-1" } })
    expect(financialDocumentRepository.createWithInstallments).not.toHaveBeenCalled()
  })

  it("on CAS-miss against a CANCELLED order, throws PURCHASE_ORDER_ALREADY_DECIDED — a real conflict, not a replay", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "CANCELLED", financialDocumentId: null })

    await expect(purchaseOrderRepository.approve("po-1", "ws-1", "user-1"))
      .rejects.toMatchObject({ code: ErrorCode.PURCHASE_ORDER_ALREADY_DECIDED })
    expect(financialDocumentRepository.createWithInstallments).not.toHaveBeenCalled()
  })

  it("throws PURCHASE_ORDER_NOT_FOUND if the id doesn't exist in this workspace at all", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(null)

    await expect(purchaseOrderRepository.approve("po-x", "ws-1", "user-1")).rejects.toThrow(AppError)
  })
})

describe("purchaseOrderRepository.cancel", () => {
  beforeEach(() => vi.clearAllMocks())

  it("CAS only matches status DRAFT — cancels and bumps version", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.purchaseOrder.findFirstOrThrow.mockResolvedValue({ id: "po-1", status: "CANCELLED" })

    await purchaseOrderRepository.cancel("po-1", "ws-1")

    expect(mockPrisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "po-1", workspaceId: "ws-1", status: "DRAFT" },
      data: { status: "CANCELLED", version: { increment: 1 } },
    })
  })

  it("on CAS-miss against an already-CANCELLED order (replay), returns it instead of throwing", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "CANCELLED" })

    const result = await purchaseOrderRepository.cancel("po-1", "ws-1")
    expect(result).toEqual({ id: "po-1", status: "CANCELLED" })
  })

  it("on CAS-miss against an APPROVED order, throws PURCHASE_ORDER_ALREADY_DECIDED — cancel can never undo an approval", async () => {
    mockPrisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "APPROVED" })

    await expect(purchaseOrderRepository.cancel("po-1", "ws-1"))
      .rejects.toMatchObject({ code: ErrorCode.PURCHASE_ORDER_ALREADY_DECIDED })
  })
})
