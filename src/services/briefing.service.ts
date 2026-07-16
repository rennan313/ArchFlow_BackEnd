import { briefingRepository } from "@/repositories/briefing.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { UpsertBriefingInput } from "@/validations/briefing"

export const briefingService = {
  async get(opportunityId: string, workspaceId: string) {
    const opp = await opportunityRepository.findById(opportunityId, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    const briefing = await briefingRepository.findByOpportunity(opportunityId, workspaceId)
    return briefing ?? null
  },

  async upsert(opportunityId: string, workspaceId: string, input: UpsertBriefingInput) {
    const opp = await opportunityRepository.findById(opportunityId, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    const briefing = await briefingRepository.upsert(opportunityId, workspaceId, input)
    // Repository re-validates workspace ownership itself (CORE-3, defense in
    // depth) — null here means that second check disagreed with the one
    // above, which should never happen in practice but must still be handled
    // explicitly rather than silently returning null from an "upsert".
    if (!briefing) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    return briefing
  },
}
