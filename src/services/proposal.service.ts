import { prisma } from "@/lib/prisma"
import { proposalRepository } from "@/repositories/proposal.repository"
import { projectRepository } from "@/repositories/project.repository"
import { clientRepository } from "@/repositories/client.repository"
import { clientService } from "@/services/client.service"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import type { CreateProposalInput, UpdateProposalInput, ProposalQueryInput } from "@/validations/proposal"

export const proposalService = {
  async list(workspaceId: string, query: ProposalQueryInput) {
    const { data, total } = await proposalRepository.findMany(workspaceId, query);
    const pagination = buildMeta(total, query.page, query.limit);
    return { data, pagination };
  },

  async getById(id: string, workspaceId: string) {
    const proposal = await proposalRepository.findById(id, workspaceId);
    if (!proposal) throw new AppError(ErrorCode.NOT_FOUND)
    return proposal;
  },

  // Resolves the client (reuse by id, reuse by exact name, or create minimal)
  // and creates the Proposal atomically — either both succeed or neither is
  // persisted, so a failed proposal never leaves an orphaned client behind.
  //
  // CORE-6 (Sprint 0) — this already used callback-form $transaction (so
  // atomicity/rollback were never the gap), but had no retry wrapper: a
  // 2-collection write (Client find-or-create + Proposal create) with no
  // protection against a losing WriteConflict under concurrent requests.
  async create(workspaceId: string, userId: string, input: CreateProposalInput) {
    return withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const { clientId, ...rest } = input
      const client = await clientService.findOrCreate(
        workspaceId, userId, { clientId, name: input.clientName }, tx,
      )
      return proposalRepository.create({
        ...rest,
        client:    { connect: { id: client.id } },
        user:      { connect: { id: userId } },
        workspace: { connect: { id: workspaceId } },
      }, tx);
    }), { context: { workspaceId, userId, entity: "Proposal", op: "create" } });
  },

  async update(id: string, workspaceId: string, input: UpdateProposalInput) {
    const existing = await proposalRepository.findById(id, workspaceId);
    if (!existing) throw new AppError(ErrorCode.NOT_FOUND)

    await proposalRepository.update(id, workspaceId, input);
    return proposalRepository.findById(id, workspaceId);
  },

  // CORE-2 (Sprint 0) — same referential guard as opportunity.service.ts
  // above (RC-2.3 pattern, one hop upstream): a Proposal that already
  // converted to a Project (Project.proposalId) can no longer be archived
  // (or deleted). See FINANCIAL_ARCHITECTURE_DECISIONS.md, Anexo B.
  async delete(id: string, workspaceId: string, userId: string) {
    const existing = await proposalRepository.findById(id, workspaceId);
    if (!existing) throw new AppError(ErrorCode.NOT_FOUND)
    await entityLifecycleService.archive({
      entity: "Proposal", id, workspaceId, userId,
      delegate: prisma.proposal,
      guard: async () => {
        const linkedProject = await projectRepository.findByProposalId(id, workspaceId)
        if (linkedProject) throw new AppError(ErrorCode.PROPOSAL_HAS_PROJECT)
      },
    });
  },

  // ADR-020 — Proposal.clientId is optional; only check the parent when one
  // is actually linked.
  async restore(id: string, workspaceId: string, userId: string) {
    const proposal = await this.getById(id, workspaceId);
    await entityLifecycleService.restore({
      entity: "Proposal", id, workspaceId, userId,
      delegate: prisma.proposal,
      integrityCheck: async () => {
        if (!proposal.clientId) return
        const client = await clientRepository.findById(proposal.clientId, workspaceId)
        if (client?.archived) throw new AppError(ErrorCode.PARENT_ARCHIVED)
      },
    });
    return this.getById(id, workspaceId);
  },
};
