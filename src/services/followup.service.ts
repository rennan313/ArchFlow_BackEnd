import { followUpRepository } from "@/repositories/followup.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { CreateFollowUpInput, UpdateFollowUpInput } from "@/validations/followup"

export const followUpService = {
  async listByOpportunity(opportunityId: string, workspaceId: string) {
    const opp = await opportunityRepository.findById(opportunityId, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    return followUpRepository.findByOpportunity(opportunityId)
  },

  async listPending(workspaceId: string) {
    return followUpRepository.findPending(workspaceId)
  },

  async listOverdue(workspaceId: string) {
    return followUpRepository.findOverdue(workspaceId)
  },

  async create(opportunityId: string, workspaceId: string, userId: string, input: CreateFollowUpInput) {
    const opp = await opportunityRepository.findById(opportunityId, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)

    return followUpRepository.create({
      nextContactDate: new Date(input.nextContactDate),
      notes:           input.notes,
      opportunity:     { connect: { id: opportunityId } },
      user:            { connect: { id: userId } },
    })
  },

  async update(id: string, workspaceId: string, input: UpdateFollowUpInput) {
    const existing = await followUpRepository.findById(id, workspaceId)
    if (!existing) throw new AppError(ErrorCode.FOLLOWUP_NOT_FOUND)

    await followUpRepository.update(id, workspaceId, {
      ...(input.nextContactDate && { nextContactDate: new Date(input.nextContactDate) }),
      ...(input.notes           !== undefined && { notes: input.notes }),
      ...(input.completed       !== undefined && { completed: input.completed }),
    })

    return followUpRepository.findById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string) {
    const existing = await followUpRepository.findById(id, workspaceId)
    if (!existing) throw new AppError(ErrorCode.FOLLOWUP_NOT_FOUND)
    await followUpRepository.delete(id, workspaceId)
  },
}
