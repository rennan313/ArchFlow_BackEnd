import { proposalSectionRepository } from "@/repositories/proposal-section.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import type {
  CreateProposalSectionInput,
  UpdateProposalSectionInput,
  ProposalSectionQueryInput,
} from "@/validations/proposal-section"

export const proposalSectionService = {
  async list(workspaceId: string, query: ProposalSectionQueryInput) {
    const { data, total } = await proposalSectionRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const section = await proposalSectionRepository.findById(id, workspaceId)
    if (!section) throw new AppError(ErrorCode.PROPOSAL_SECTION_NOT_FOUND)
    return section
  },

  create(workspaceId: string, userId: string, input: CreateProposalSectionInput) {
    return proposalSectionRepository.create(workspaceId, userId, input)
  },

  async update(id: string, workspaceId: string, input: UpdateProposalSectionInput) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_SECTION_NOT_FOUND)
    await proposalSectionRepository.update(id, workspaceId, input)
    return proposalSectionRepository.findById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_SECTION_NOT_FOUND)
    await proposalSectionRepository.delete(id, workspaceId)
  },
}
