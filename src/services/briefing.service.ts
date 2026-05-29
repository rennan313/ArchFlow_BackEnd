import { briefingRepository } from "@/repositories/briefing.repository"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import type { UpsertBriefingInput } from "@/validations/briefing"

export const briefingService = {
  async get(opportunityId: string, userId: string) {
    const opp = await opportunityRepository.findById(opportunityId, userId)
    if (!opp) throw new Error("OPPORTUNITY_NOT_FOUND")
    const briefing = await briefingRepository.findByOpportunity(opportunityId)
    return briefing ?? null
  },

  async upsert(opportunityId: string, userId: string, input: UpsertBriefingInput) {
    const opp = await opportunityRepository.findById(opportunityId, userId)
    if (!opp) throw new Error("OPPORTUNITY_NOT_FOUND")
    return briefingRepository.upsert(opportunityId, input)
  },
}
