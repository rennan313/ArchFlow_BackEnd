import { proposalRepository } from "@/repositories/proposal.repository";
import type { CreateProposalInput, UpdateProposalInput, ProposalQueryInput } from "@/validations/proposal";
import { buildMeta } from "@/lib/pagination";

export const proposalService = {
  async list(userId: string, query: ProposalQueryInput) {
    const { data, total } = await proposalRepository.findMany(userId, query);
    const pagination = buildMeta(total, query.page, query.limit);
    return { data, pagination };
  },

  async getById(id: string, userId: string) {
    const proposal = await proposalRepository.findById(id, userId);
    if (!proposal) throw new Error("NOT_FOUND");
    return proposal;
  },

  async create(userId: string, input: CreateProposalInput) {
    return proposalRepository.create({
      ...input,
      user: { connect: { id: userId } },
    });
  },

  async update(id: string, userId: string, input: UpdateProposalInput) {
    const existing = await proposalRepository.findById(id, userId);
    if (!existing) throw new Error("NOT_FOUND");

    await proposalRepository.update(id, userId, input);
    return proposalRepository.findById(id, userId);
  },

  async delete(id: string, userId: string) {
    const existing = await proposalRepository.findById(id, userId);
    if (!existing) throw new Error("NOT_FOUND");
    await proposalRepository.delete(id, userId);
  },
};
