import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/document.repository")
vi.mock("@/repositories/client.repository")
vi.mock("@/repositories/project.repository")
vi.mock("@/services/storage/supabase.service")

import { documentService } from "@/services/document.service"
import { documentRepository } from "@/repositories/document.repository"
import { clientRepository } from "@/repositories/client.repository"
import { projectRepository } from "@/repositories/project.repository"
import { storageService } from "@/services/storage/supabase.service"

function fakeFile(name = "plant.pdf") {
  return { name, type: "application/pdf", size: 1024 } as unknown as File
}

describe("documentService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(storageService.uploadDocument).mockResolvedValue({ url: "https://x/y.pdf", storagePath: "y.pdf" } as never)
    vi.mocked(documentRepository.create).mockResolvedValue({ id: "doc-1" } as never)
  })

  it("uploads and creates the document when clientId belongs to the workspace", async () => {
    const result = await documentService.create("workspace-1", "user-1", fakeFile(), { clientId: "client-1" })

    expect(storageService.uploadDocument).toHaveBeenCalled()
    expect(documentRepository.create).toHaveBeenCalled()
    expect((result as { id: string }).id).toBe("doc-1")
  })

  // Fase 5 audit, P0 #1 family — document.service.ts had the same unvalidated
  // clientId/projectId/folderId pattern as project/meeting create.
  it("rejects with CROSS_TENANT_REFERENCE when clientId belongs to a different workspace, without uploading", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(null)

    await expect(
      documentService.create("workspace-B", "user-1", fakeFile(), { clientId: "client-from-workspace-A" }),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })

    // Validation must happen before the storage upload, so a cross-tenant
    // attempt never reaches Supabase Storage.
    expect(storageService.uploadDocument).not.toHaveBeenCalled()
    expect(documentRepository.create).not.toHaveBeenCalled()
  })

  it("rejects with CROSS_TENANT_REFERENCE when projectId belongs to a different workspace", async () => {
    vi.mocked(projectRepository.findById).mockResolvedValue(null)

    await expect(
      documentService.create("workspace-B", "user-1", fakeFile(), { projectId: "project-from-workspace-A" }),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(storageService.uploadDocument).not.toHaveBeenCalled()
  })

  it("rejects with CROSS_TENANT_REFERENCE when folderId belongs to a different workspace", async () => {
    vi.mocked(documentRepository.findFolderById).mockResolvedValue(null)

    await expect(
      documentService.create("workspace-B", "user-1", fakeFile(), { clientId: "client-1", folderId: "folder-from-workspace-A" }),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(storageService.uploadDocument).not.toHaveBeenCalled()
  })
})

describe("documentService.createFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientRepository.findById).mockResolvedValue({ id: "client-1" } as never)
    vi.mocked(documentRepository.createFolder).mockResolvedValue({ id: "folder-1" } as never)
  })

  it("creates the folder when clientId belongs to the workspace", async () => {
    await documentService.createFolder("workspace-1", "user-1", { name: "Plantas", clientId: "client-1" } as never)
    expect(documentRepository.createFolder).toHaveBeenCalled()
  })

  it("rejects with CROSS_TENANT_REFERENCE when clientId belongs to a different workspace", async () => {
    vi.mocked(clientRepository.findById).mockResolvedValue(null)

    await expect(
      documentService.createFolder("workspace-B", "user-1", { name: "Plantas", clientId: "client-from-workspace-A" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.CROSS_TENANT_REFERENCE })
    expect(documentRepository.createFolder).not.toHaveBeenCalled()
  })
})
