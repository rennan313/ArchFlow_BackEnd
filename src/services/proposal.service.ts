import { prisma } from "@/lib/prisma"
import { proposalRepository } from "@/repositories/proposal.repository"
import { clientService } from "@/services/client.service"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
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
  async create(workspaceId: string, userId: string, input: CreateProposalInput) {
    return prisma.$transaction(async (tx) => {
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
    });
  },

  async update(id: string, workspaceId: string, input: UpdateProposalInput) {
    const existing = await proposalRepository.findById(id, workspaceId);
    if (!existing) throw new AppError(ErrorCode.NOT_FOUND)

    await proposalRepository.update(id, workspaceId, input);
    return proposalRepository.findById(id, workspaceId);
  },

  async delete(id: string, workspaceId: string) {
    const existing = await proposalRepository.findById(id, workspaceId);
    if (!existing) throw new AppError(ErrorCode.NOT_FOUND)
    await proposalRepository.delete(id, workspaceId);
  },
};
