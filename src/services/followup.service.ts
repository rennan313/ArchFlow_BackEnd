import { followUpRepository } from "@/repositories/followup.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { CreateFollowUpInput, UpdateFollowUpInput } from "@/validations/followup"

export const followUpService = {
  async listByOpportunity(opportunityId: string, userId: string) {
    const opp = await opportunityRepository.findById(opportunityId, userId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    return followUpRepository.findByOpportunity(opportunityId)
  },

  async listPending(userId: string) {
    return followUpRepository.findPending(userId)
  },

  async listOverdue(userId: string) {
    return followUpRepository.findOverdue(userId)
  },

  async create(opportunityId: string, userId: string, input: CreateFollowUpInput) {
    const opp = await opportunityRepository.findById(opportunityId, userId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)

    return followUpRepository.create({
      nextContactDate: new Date(input.nextContactDate),
      notes:           input.notes,
      opportunity:     { connect: { id: opportunityId } },
      user:            { connect: { id: userId } },
    })
  },

  async update(id: string, userId: string, input: UpdateFollowUpInput) {
    const existing = await followUpRepository.findById(id, userId)
    if (!existing) throw new AppError(ErrorCode.FOLLOWUP_NOT_FOUND)

    await followUpRepository.update(id, userId, {
      ...(input.nextContactDate && { nextContactDate: new Date(input.nextContactDate) }),
      ...(input.notes           !== undefined && { notes: input.notes }),
      ...(input.completed       !== undefined && { completed: input.completed }),
    })

    return followUpRepository.findById(id, userId)
  },

  async delete(id: string, userId: string) {
    const existing = await followUpRepository.findById(id, userId)
    if (!existing) throw new AppError(ErrorCode.FOLLOWUP_NOT_FOUND)
    await followUpRepository.delete(id, userId)
  },
}
