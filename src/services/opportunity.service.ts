import { opportunityRepository } from "@/repositories/opportunity.repository"
import { clientRepository } from "@/repositories/client.repository"
import { buildMeta } from "@/lib/pagination"
import { STAGE_PROBABILITY } from "@/validations/opportunity"
import type { CreateOpportunityInput, UpdateOpportunityInput, OpportunityQueryInput } from "@/validations/opportunity"

export const opportunityService = {
  async list(userId: string, query: OpportunityQueryInput) {
    const { data, total } = await opportunityRepository.findMany(userId, query)
    return { data: data.map(withWeightedRevenue), pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, userId: string) {
    const opp = await opportunityRepository.findById(id, userId)
    if (!opp) throw new Error("OPPORTUNITY_NOT_FOUND")
    return withWeightedRevenue(opp)
  },

  async create(userId: string, input: CreateOpportunityInput) {
    // Validate client belongs to user
    const client = await clientRepository.findById(input.clientId, userId)
    if (!client) throw new Error("CLIENT_NOT_FOUND")

    const probability = STAGE_PROBABILITY[input.stage ?? "LEAD"]

    const opp = await opportunityRepository.create({
      userId,
      clientId:        input.clientId,
      title:           input.title,
      projectType:     input.projectType,
      city:            input.city,
      state:           input.state,
      squareMeters:    input.squareMeters,
      estimatedBudget: input.estimatedBudget,
      estimatedRevenue: input.estimatedRevenue,
      probability,
      stage:           input.stage ?? "LEAD",
      source:          input.source,
    })
    return withWeightedRevenue(opp)
  },

  async update(id: string, userId: string, input: UpdateOpportunityInput) {
    await this.getById(id, userId)

    const updateData: Record<string, unknown> = { ...input }

    // Auto-update probability when stage changes (unless manually overridden)
    if (input.stage && input.probability === undefined) {
      updateData.probability = STAGE_PROBABILITY[input.stage]
    }

    await opportunityRepository.update(id, userId, updateData)
    return this.getById(id, userId)
  },

  async delete(id: string, userId: string) {
    await this.getById(id, userId)
    await opportunityRepository.delete(id, userId)
  },
}

function withWeightedRevenue<T extends { estimatedRevenue?: number | null; probability: number }>(opp: T) {
  const weightedRevenue = opp.estimatedRevenue != null
    ? Math.round(opp.estimatedRevenue * opp.probability) / 100
    : null
  return { ...opp, weightedRevenue }
}
