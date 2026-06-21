import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/client.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/repositories/proposal.repository")
vi.mock("@/repositories/opportunity.repository")
vi.mock("@/repositories/document.repository")

import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { clientRepository } from "@/repositories/client.repository"
import { projectRepository } from "@/repositories/project.repository"
import { proposalRepository } from "@/repositories/proposal.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { documentRepository } from "@/repositories/document.repository"

describe("assertWorkspaceReferences", () => {
  beforeEach(() => vi.clearAllMocks())

  it("resolves without throwing when no reference fields are provided", async () => {
    await expect(assertWorkspaceReferences("workspace-A", {})).resolves.toBeUndefined()
    expect(clientRepository.findById).not.toHaveBeenCalled()
  })

  it("skips null/undefined fields without querying for them", async () => {
    await assertWorkspaceReferences("workspace-A", { clientId: undefined, projectId: null })
    expect(clientRepository.findById).not.toHaveBeenCalled()
    expect(projectRepository.findById).not.toHaveBeenCalled()
  })

  it("resolves when every provided reference belongs to the workspace", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(projectRepository.findById).mockResolvedValue({ id: "project-1" } as never)

    await expect(
      assertWorkspaceReferences("workspace-A", { clientId: "client-1", projectId: "project-1" }),
    ).resolves.toBeUndefined()

    expect(clientRepository.findById).toHaveBeenCalledWith("client-1", "workspace-A")
    expect(projectRepository.findById).toHaveBeenCalledWith("project-1", "workspace-A")
  })

  // Fase 5 audit, P0 #1 — this is the exact cross-tenant reference injection
  // confirmed live against project/meeting create: workspace B passing a
  // clientId that belongs to workspace A.
  it("throws CROSS_TENANT_REFERENCE when clientId belongs to a different workspace", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(null) // findFirst({ id, workspaceId }) found nothing for THIS workspace

    const promise = assertWorkspaceReferences("workspace-B", { clientId: "client-from-workspace-A" })

    await expect(promise).rejects.toThrow(AppError)
    await expect(promise).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(clientRepository.findById).toHaveBeenCalledWith("client-from-workspace-A", "workspace-B")
  })

  it("throws when any one of several references is cross-tenant, even if the others are valid", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(projectRepository.findById).mockResolvedValue(null)
    vi.mocked(proposalRepository.findById).mockResolvedValue({ id: "proposal-1" } as never)

    await expect(
      assertWorkspaceReferences("workspace-B", {
        clientId: "client-1", projectId: "cross-tenant-project", proposalId: "proposal-1",
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
  })

  it("validates opportunityId and folderId the same way", async () => {
    vi.mocked(opportunityRepository.findById).mockResolvedValue(null)
    vi.mocked(documentRepository.findFolderById).mockResolvedValue({ id: "folder-1" } as never)

    await expect(
      assertWorkspaceReferences("workspace-B", { opportunityId: "cross-tenant-opp", folderId: "folder-1" }),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
  })

  it("checks all provided references in parallel (one round-trip per field, not sequential)", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(projectRepository.findById).mockResolvedValue({ id: "project-1" } as never)
    vi.mocked(proposalRepository.findById).mockResolvedValue({ id: "proposal-1" } as never)

    await assertWorkspaceReferences("workspace-A", {
      clientId: "client-1", projectId: "project-1", proposalId: "proposal-1",
    })

    expect(clientRepository.findById).toHaveBeenCalledTimes(1)
    expect(projectRepository.findById).toHaveBeenCalledTimes(1)
    expect(proposalRepository.findById).toHaveBeenCalledTimes(1)
  })
})
