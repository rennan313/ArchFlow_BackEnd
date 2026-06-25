import { proposalTemplateRepository } from "@/repositories/proposal-template.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import type {
  CreateProposalTemplateInput,
  UpdateProposalTemplateInput,
  ProposalTemplateQueryInput,
} from "@/validations/proposal-template"

export const proposalTemplateService = {
  async list(workspaceId: string, query: ProposalTemplateQueryInput) {
    const { data, total } = await proposalTemplateRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const template = await proposalTemplateRepository.findById(id, workspaceId)
    if (!template) throw new AppError(ErrorCode.PROPOSAL_TEMPLATE_NOT_FOUND)
    return template
  },

  create(workspaceId: string, userId: string, input: CreateProposalTemplateInput) {
    return proposalTemplateRepository.create(workspaceId, userId, input)
  },

  async update(id: string, workspaceId: string, input: UpdateProposalTemplateInput) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_TEMPLATE_NOT_FOUND)
    await proposalTemplateRepository.update(id, workspaceId, input)
    return proposalTemplateRepository.findById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_TEMPLATE_NOT_FOUND)
    await proposalTemplateRepository.delete(id, workspaceId)
  },
}
