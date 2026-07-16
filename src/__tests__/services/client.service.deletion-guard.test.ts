import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

// RC-2.3 — focused test for the new safe-deletion guard added to
// client.service.ts#delete. Not a full client.service suite (none existed
// before this sprint and building one is out of scope for a critical-fixes
// sprint) — just the behavior this sprint actually changed.
vi.mock("@/repositories/client.repository")
vi.mock("@/services/automation.service")
vi.mock("@/modules/financial/financial.module", () => ({
  financialDocumentService: { hasDocumentsForProject: vi.fn(), hasDocumentsForClient: vi.fn() },
}))

import { clientService } from "@/services/client.service"
import { clientRepository } from "@/repositories/client.repository"
import { financialDocumentService } from "@/modules/financial/financial.module"

const mockClient = { id: "client-1", userId: "user-1", name: "Cliente Teste", status: "ACTIVE" as const }

describe("clientService.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("blocks deletion (CLIENT_HAS_FINANCIAL_HISTORY) when a FinancialDocument references this client", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(mockClient as never)
    vi.mocked(financialDocumentService.hasDocumentsForClient).mockResolvedValue(true)

    await expect(
      clientService.delete("client-1", "workspace-1"),
    ).rejects.toMatchObject({ code: ErrorCode.CLIENT_HAS_FINANCIAL_HISTORY })
    expect(clientRepository.delete).not.toHaveBeenCalled()
  })

  it("allows deletion when no FinancialDocument references this client", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(mockClient as never)
    vi.mocked(financialDocumentService.hasDocumentsForClient).mockResolvedValue(false)
    vi.mocked(clientRepository.delete).mockResolvedValue({ count: 1 } as never)

    await clientService.delete("client-1", "workspace-1")

    expect(clientRepository.delete).toHaveBeenCalledWith("client-1", "workspace-1")
  })
})
