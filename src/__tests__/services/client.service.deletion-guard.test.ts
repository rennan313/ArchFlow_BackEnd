import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

// RC-2.3 — focused test for the safe-deletion guard on client.service.ts#delete.
// Not a full client.service suite (none existed before this sprint and
// building one is out of scope for a critical-fixes sprint) — just the
// behavior this sprint actually changed. Post-ADR-020, the archive itself is
// delegated to entityLifecycleService, so this test drives the guard
// callback the same way the real service would rather than asserting on a
// repository method that no longer exists.
vi.mock("@/repositories/client.repository")
vi.mock("@/services/automation.service")
vi.mock("@/services/entityLifecycle.service")
vi.mock("@/modules/financial/financial.module", () => ({
  financialDocumentService: { hasDocumentsForProject: vi.fn(), hasDocumentsForClient: vi.fn() },
}))

import { clientService } from "@/services/client.service"
import { clientRepository } from "@/repositories/client.repository"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import { financialDocumentService } from "@/modules/financial/financial.module"

const mockClient = { id: "client-1", userId: "user-1", name: "Cliente Teste", status: "ACTIVE" as const }

describe("clientService.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("blocks deletion (CLIENT_HAS_FINANCIAL_HISTORY) when a FinancialDocument references this client", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(mockClient as never)
    vi.mocked(financialDocumentService.hasDocumentsForClient).mockResolvedValue(true)
    vi.mocked(entityLifecycleService.archive).mockImplementation(async (opts) => {
      if (opts.guard) await opts.guard()
    })

    await expect(
      clientService.delete("client-1", "workspace-1", "user-1"),
    ).rejects.toMatchObject({ code: ErrorCode.CLIENT_HAS_FINANCIAL_HISTORY })
  })

  it("allows archiving when no FinancialDocument references this client", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(mockClient as never)
    vi.mocked(financialDocumentService.hasDocumentsForClient).mockResolvedValue(false)
    vi.mocked(entityLifecycleService.archive).mockImplementation(async (opts) => {
      if (opts.guard) await opts.guard()
    })

    await clientService.delete("client-1", "workspace-1", "user-1")

    expect(entityLifecycleService.archive).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "Client", id: "client-1", workspaceId: "workspace-1", userId: "user-1" }),
    )
  })
})
