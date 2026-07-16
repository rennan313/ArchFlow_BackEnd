import { costCenterRepository } from "@/repositories/costCenter.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { CreateCostCenterInput, UpdateCostCenterInput } from "@/validations/costCenter"

export const costCenterService = {
  list(workspaceId: string, includeArchived: boolean) {
    return costCenterRepository.findMany(workspaceId, includeArchived)
  },

  async getById(id: string, workspaceId: string) {
    const costCenter = await costCenterRepository.findById(id, workspaceId)
    if (!costCenter) throw new AppError(ErrorCode.COST_CENTER_NOT_FOUND)
    return costCenter
  },

  async create(workspaceId: string, input: CreateCostCenterInput) {
    const existing = await costCenterRepository.findByName(input.name, workspaceId)
    if (existing) throw new AppError(ErrorCode.COST_CENTER_NAME_TAKEN)

    return costCenterRepository.create({ workspaceId, name: input.name })
  },

  async update(id: string, workspaceId: string, input: UpdateCostCenterInput) {
    await this.getById(id, workspaceId)

    if (input.name) {
      const existing = await costCenterRepository.findByName(input.name, workspaceId)
      if (existing && existing.id !== id) throw new AppError(ErrorCode.COST_CENTER_NAME_TAKEN)
    }

    await costCenterRepository.update(id, workspaceId, input)
    return this.getById(id, workspaceId)
  },

  async archive(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    await costCenterRepository.update(id, workspaceId, { isArchived: true })
  },
}
