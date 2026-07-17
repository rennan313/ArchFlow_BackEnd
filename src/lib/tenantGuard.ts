import { clientRepository } from "@/repositories/client.repository"
import { projectRepository } from "@/repositories/project.repository"
import { proposalRepository } from "@/repositories/proposal.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { documentRepository } from "@/repositories/document.repository"
import { supplierRepository } from "@/repositories/supplier.repository"
import { supplierCategoryRepository } from "@/repositories/supplierCategory.repository"
import { bankAccountRepository } from "@/repositories/bankAccount.repository"
import { financialCategoryRepository } from "@/repositories/financialCategory.repository"
import { costCenterRepository } from "@/repositories/costCenter.repository"
import { taskRepository } from "@/repositories/task.repository"
import { activityCategoryRepository } from "@/repositories/activityCategory.repository"
import { AppError, ErrorCode } from "@/lib/errors"

type ReferenceField =
  | "clientId" | "projectId" | "proposalId" | "opportunityId" | "folderId"
  | "supplierId" | "supplierCategoryId" | "bankAccountId" | "financialCategoryId" | "costCenterId"
  | "taskId" | "activityCategoryId"

/**
 * Single source of truth for "does this foreign-key-shaped input belong to
 * the caller's workspace". Every service that accepts a reference field from
 * request input (clientId, projectId, proposalId, opportunityId, folderId)
 * must resolve it through here instead of trusting it or hand-rolling its
 * own findFirst({ id, workspaceId }) check — that's exactly how the
 * cross-tenant IDOR in project/meeting create (Fase 5 audit, P0 #1) happened:
 * opportunity.service.ts validated clientId, project/meeting.service.ts didn't.
 */
const RESOLVERS: Record<ReferenceField, (id: string, workspaceId: string) => Promise<unknown>> = {
  clientId:      (id, workspaceId) => clientRepository.findById(id, workspaceId),
  projectId:     (id, workspaceId) => projectRepository.findById(id, workspaceId),
  proposalId:    (id, workspaceId) => proposalRepository.findById(id, workspaceId),
  opportunityId: (id, workspaceId) => opportunityRepository.findById(id, workspaceId),
  folderId:      (id, workspaceId) => documentRepository.findFolderById(id, workspaceId),
  supplierId:         (id, workspaceId) => supplierRepository.findById(id, workspaceId),
  supplierCategoryId: (id, workspaceId) => supplierCategoryRepository.findById(id, workspaceId),
  bankAccountId:      (id, workspaceId) => bankAccountRepository.findById(id, workspaceId),
  financialCategoryId: (id, workspaceId) => financialCategoryRepository.findById(id, workspaceId),
  costCenterId:       (id, workspaceId) => costCenterRepository.findById(id, workspaceId),
  taskId:             (id, workspaceId) => taskRepository.findById(id, workspaceId),
  activityCategoryId: (id, workspaceId) => activityCategoryRepository.findById(id, workspaceId),
}

export type TenantReferences = Partial<Record<ReferenceField, string | null | undefined>>

/**
 * Resolves every non-null reference in `refs` against `workspaceId` in
 * parallel. Throws AppError(CROSS_TENANT_REFERENCE) — mapped to 403 — if any
 * of them doesn't belong to that workspace (or doesn't exist at all).
 * Fields that are null/undefined are skipped (optional references not provided).
 */
export async function assertWorkspaceReferences(workspaceId: string, refs: TenantReferences): Promise<void> {
  const entries = (Object.entries(refs) as [ReferenceField, string | null | undefined][])
    .filter((entry): entry is [ReferenceField, string] => entry[1] != null)

  if (entries.length === 0) return

  const results = await Promise.all(entries.map(([field, id]) => RESOLVERS[field](id, workspaceId)))

  const invalidFields = entries.filter((_, i) => !results[i]).map(([field]) => field)
  if (invalidFields.length > 0) {
    throw new AppError(
      ErrorCode.CROSS_TENANT_REFERENCE,
      `Reference(s) not found in this workspace: ${invalidFields.join(", ")}`,
    )
  }
}
