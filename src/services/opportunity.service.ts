import { opportunityRepository } from "@/repositories/opportunity.repository"
import { clientRepository } from "@/repositories/client.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { STAGE_PROBABILITY } from "@/validations/opportunity"
import type { CreateOpportunityInput, UpdateOpportunityInput, OpportunityQueryInput } from "@/validations/opportunity"

export const opportunityService = {
  async list(workspaceId: string, query: OpportunityQueryInput) {
    const { data, total } = await opportunityRepository.findMany(workspaceId, query)
    return { data: data.map(withWeightedRevenue), pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const opp = await opportunityRepository.findById(id, workspaceId)
    if (!opp) throw new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND)
    return withWeightedRevenue(opp)
  },

  async create(workspaceId: string, userId: string, input: CreateOpportunityInput) {
    // Validate client belongs to this workspace
    const client = await clientRepository.findById(input.clientId, workspaceId)
    if (!client) throw new AppError(ErrorCode.CLIENT_NOT_FOUND)

    const probability = STAGE_PROBABILITY[input.stage ?? "LEAD"]

    const opp = await opportunityRepository.create({
      userId,
      workspaceId,
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

  async update(id: string, workspaceId: string, input: UpdateOpportunityInput) {
    await this.getById(id, workspaceId)

    const updateData: Record<string, unknown> = { ...input }

    // Auto-update probability when stage changes (unless manually overridden)
    if (input.stage && input.probability === undefined) {
      updateData.probability = STAGE_PROBABILITY[input.stage]
    }

    await opportunityRepository.update(id, workspaceId, updateData)
    return this.getById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    await opportunityRepository.delete(id, workspaceId)
  },
}

function withWeightedRevenue<T extends { estimatedRevenue?: number | null; probability: number }>(opp: T) {
  const weightedRevenue = opp.estimatedRevenue != null
    ? Math.round(opp.estimatedRevenue * opp.probability) / 100
    : null
  return { ...opp, weightedRevenue }
}
