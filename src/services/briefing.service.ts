import { briefingRepository } from "@/repositories/briefing.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { UpsertBriefingInput } from "@/validations/briefing"

export const briefingService = {
  async get(opportunityId: string, workspaceId: string) {
    const opp = await opportunityRepository.findById(opportunityId, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    const briefing = await briefingRepository.findByOpportunity(opportunityId)
    return briefing ?? null
  },

  async upsert(opportunityId: string, workspaceId: string, input: UpsertBriefingInput) {
    const opp = await opportunityRepository.findById(opportunityId, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    return briefingRepository.upsert(opportunityId, input)
  },
}
