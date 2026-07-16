import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/financialDocument.repository")
vi.mock("@/repositories/financialCategory.repository")
vi.mock("@/lib/tenantGuard")
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { financialDocumentService } from "@/modules/financial/services/financialDocument.service"
import { financialDocumentRepository } from "@/repositories/financialDocument.repository"
import { financialCategoryRepository } from "@/repositories/financialCategory.repository"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"

const mockCategory = { id: "cat-1", workspaceId: "ws-1", direction: "PAYABLE" as const, name: "Marcenaria" }
const mockDoc = { id: "doc-1", workspaceId: "ws-1", direction: "PAYABLE" as const, isCancelled: false, totalAmountCents: 300_000n }

describe("financialDocumentService.create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("validates every foreign reference belongs to the workspace before writing anything", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(financialDocumentRepository.createWithInstallments).mockResolvedValue(mockDoc as never)

    await financialDocumentService.create("ws-1", "user-1", {
      direction: "PAYABLE", categoryId: "cat-1", description: "Marcenaria", competencyDate: new Date(),
      installments: [{ amount: 3000, dueDate: new Date() }],
    } as never)

    expect(assertWorkspaceReferences).toHaveBeenCalledWith("ws-1", expect.objectContaining({ financialCategoryId: "cat-1" }))
  })

  it("rejects when the category's direction doesn't match the document's direction", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue({ ...mockCategory, direction: "RECEIVABLE" } as never)

    await expect(
      financialDocumentService.create("ws-1", "user-1", {
        direction: "PAYABLE", categoryId: "cat-1", description: "x", competencyDate: new Date(),
        installments: [{ amount: 100, dueDate: new Date() }],
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_CATEGORY_DIRECTION_MISMATCH })
    expect(financialDocumentRepository.createWithInstallments).not.toHaveBeenCalled()
  })

  it("converts installment amounts from reais to BigInt cents via the money library before persisting", async () => {
    vi.mocked(assertWorkspaceReferences).mockResolvedValue(undefined)
    vi.mocked(financialCategoryRepository.findById).mockResolvedValue(mockCategory as never)
    vi.mocked(financialDocumentRepository.createWithInstallments).mockResolvedValue(mockDoc as never)

    await financialDocumentService.create("ws-1", "user-1", {
      direction: "PAYABLE", categoryId: "cat-1", description: "x", competencyDate: new Date(),
      installments: [{ amount: 1234.56, dueDate: new Date() }, { amount: 100, dueDate: new Date() }],
    } as never)

    expect(financialDocumentRepository.createWithInstallments).toHaveBeenCalledWith(
      expect.objectContaining({ installments: [{ amountCents: 123456n, dueDate: expect.any(Date) }, { amountCents: 10000n, dueDate: expect.any(Date) }] }),
    )
  })
})

describe("financialDocumentService.cancel", () => {
  beforeEach(() => vi.clearAllMocks())

  it("cancels when no payments exist", async () => {
    vi.mocked(financialDocumentRepository.findById).mockResolvedValue(mockDoc as never)
    vi.mocked(financialDocumentRepository.cancelIfNoPayments).mockResolvedValue({ cancelled: true, hadPayments: false })

    await financialDocumentService.cancel("doc-1", "ws-1")

    expect(financialDocumentRepository.cancelIfNoPayments).toHaveBeenCalledWith("doc-1", "ws-1")
  })

  it("blocks cancellation (FINANCIAL_DOCUMENT_HAS_PAYMENTS) when a payment already exists", async () => {
    vi.mocked(financialDocumentRepository.findById).mockResolvedValue(mockDoc as never)
    vi.mocked(financialDocumentRepository.cancelIfNoPayments).mockResolvedValue({ cancelled: false, hadPayments: true })

    await expect(
      financialDocumentService.cancel("doc-1", "ws-1"),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_DOCUMENT_HAS_PAYMENTS })
  })

  it("throws NOT_FOUND before even attempting cancellation for a document outside the workspace", async () => {
    vi.mocked(financialDocumentRepository.findById).mockResolvedValue(null)

    await expect(financialDocumentService.cancel("doc-1", "other-ws")).rejects.toThrow(AppError)
    expect(financialDocumentRepository.cancelIfNoPayments).not.toHaveBeenCalled()
  })
})

describe("financialDocumentService — RC-2.3 safe-deletion guards", () => {
  beforeEach(() => vi.clearAllMocks())

  it("hasDocumentsForProject delegates to the repository existence check", async () => {
    vi.mocked(financialDocumentRepository.existsForProject).mockResolvedValue(true)
    expect(await financialDocumentService.hasDocumentsForProject("proj-1", "ws-1")).toBe(true)
    expect(financialDocumentRepository.existsForProject).toHaveBeenCalledWith("proj-1", "ws-1")
  })

  it("hasDocumentsForClient delegates to the repository existence check", async () => {
    vi.mocked(financialDocumentRepository.existsForClient).mockResolvedValue(false)
    expect(await financialDocumentService.hasDocumentsForClient("client-1", "ws-1")).toBe(false)
  })
})
