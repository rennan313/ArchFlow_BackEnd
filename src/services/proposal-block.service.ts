import { proposalBlockRepository } from "@/repositories/proposal-block.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import type {
  CreateProposalBlockInput,
  UpdateProposalBlockInput,
  ProposalBlockQueryInput,
} from "@/validations/proposal-block"

export const proposalBlockService = {
  async list(workspaceId: string, query: ProposalBlockQueryInput) {
    const { data, total } = await proposalBlockRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const block = await proposalBlockRepository.findById(id, workspaceId)
    if (!block) throw new AppError(ErrorCode.PROPOSAL_BLOCK_NOT_FOUND)
    return block
  },

  create(workspaceId: string, userId: string, input: CreateProposalBlockInput) {
    return proposalBlockRepository.create(workspaceId, userId, input)
  },

  async update(id: string, workspaceId: string, input: UpdateProposalBlockInput) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_BLOCK_NOT_FOUND)
    await proposalBlockRepository.update(id, workspaceId, input)
    return proposalBlockRepository.findById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_BLOCK_NOT_FOUND)
    await proposalBlockRepository.delete(id, workspaceId)
  },
}
