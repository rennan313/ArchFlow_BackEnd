import { followUpRepository } from "@/repositories/followup.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import type { CreateFollowUpInput, UpdateFollowUpInput } from "@/validations/followup"

export const followUpService = {
  async listByOpportunity(opportunityId: string, workspaceId: string) {
    const opp = await opportunityRepository.findById(opportunityId, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    return followUpRepository.findByOpportunity(opportunityId, workspaceId)
  },

  async listPending(workspaceId: string) {
    return followUpRepository.findPending(workspaceId)
  },

  async listOverdue(workspaceId: string) {
    return followUpRepository.findOverdue(workspaceId)
  },

  async create(opportunityId: string, workspaceId: string, userId: string, input: CreateFollowUpInput) {
    // Centralized cross-tenant guard — same resolver opportunityRepository.findById
    // used to call ad-hoc here; now routed through src/lib/tenantGuard.ts so every
    // module checks references the same way (Fase 5 audit, P0 #1).
    await assertWorkspaceReferences(workspaceId, { opportunityId })

    return followUpRepository.create({
      workspaceId,
      opportunityId,
      userId,
      nextContactDate: new Date(input.nextContactDate),
      notes:           input.notes,
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
