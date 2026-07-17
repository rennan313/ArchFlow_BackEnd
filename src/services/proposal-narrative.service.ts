import { prisma } from "@/lib/prisma"
import { proposalNarrativeRepository } from "@/repositories/proposal-narrative.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
import type {
  CreateProposalNarrativeInput,
  UpdateProposalNarrativeInput,
  ProposalNarrativeQueryInput,
} from "@/validations/proposal-narrative"

export const proposalNarrativeService = {
  async list(workspaceId: string, query: ProposalNarrativeQueryInput) {
    const { data, total } = await proposalNarrativeRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const narrative = await proposalNarrativeRepository.findById(id, workspaceId)
    if (!narrative) throw new AppError(ErrorCode.PROPOSAL_NARRATIVE_NOT_FOUND)
    return narrative
  },

  create(workspaceId: string, userId: string, input: CreateProposalNarrativeInput) {
    return proposalNarrativeRepository.create(workspaceId, userId, input)
  },

  async update(id: string, workspaceId: string, input: UpdateProposalNarrativeInput) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_NARRATIVE_NOT_FOUND)
    await proposalNarrativeRepository.update(id, workspaceId, input)
    return proposalNarrativeRepository.findById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string, userId: string) {
    const existing = await this.getById(id, workspaceId)
    if (existing.workspaceId !== workspaceId) throw new AppError(ErrorCode.PROPOSAL_NARRATIVE_NOT_FOUND)
    await entityLifecycleService.archive({
      entity: "ProposalNarrative", id, workspaceId, userId,
      delegate: prisma.proposalNarrative,
    })
  },

  async restore(id: string, workspaceId: string, userId: string) {
    await entityLifecycleService.restore({
      entity: "ProposalNarrative", id, workspaceId, userId,
      delegate: prisma.proposalNarrative,
    })
    return this.getById(id, workspaceId)
  },
}
