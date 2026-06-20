import { proposalRepository } from "@/repositories/proposal.repository"
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

  async create(workspaceId: string, userId: string, input: CreateProposalInput) {
    return proposalRepository.create({
      ...input,
      user:      { connect: { id: userId } },
      workspace: { connect: { id: workspaceId } },
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
