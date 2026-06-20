import { projectRepository } from "@/repositories/project.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import type { CreateProjectInput, UpdateProjectInput, ProjectQueryInput } from "@/validations/project"

export const projectService = {
  async list(workspaceId: string, query: ProjectQueryInput) {
    const { data, total } = await projectRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const project = await projectRepository.findById(id, workspaceId)
    if (!project) throw new AppError(ErrorCode.PROJECT_NOT_FOUND)
    return project
  },

  async create(workspaceId: string, userId: string, input: CreateProjectInput) {
    return projectRepository.create(workspaceId, userId, {
      clientId:         input.clientId,
      proposalId:       input.proposalId,
      name:             input.name,
      code:             input.code,
      description:      input.description,
      type:             input.type,
      status:           input.status ?? "BRIEFING",
      squareMeters:     input.squareMeters,
      address:          input.address,
      city:             input.city,
      state:            input.state,
      startDate:        input.startDate,
      estimatedEndDate: input.estimatedEndDate,
      actualEndDate:    input.actualEndDate,
      contractValue:    input.contractValue,
      notes:            input.notes,
    })
  },

  async update(id: string, workspaceId: string, input: UpdateProjectInput) {
    await this.getById(id, workspaceId)
    await projectRepository.update(id, workspaceId, input as Parameters<typeof projectRepository.update>[2])
    return projectRepository.findById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    await projectRepository.delete(id, workspaceId)
  },
}
