import { clientRepository } from "@/repositories/client.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import type { CreateClientInput, UpdateClientInput, ClientQueryInput } from "@/validations/client"

export const clientService = {
  async list(userId: string, query: ClientQueryInput) {
    const { data, total } = await clientRepository.findMany(userId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, userId: string) {
    const client = await clientRepository.findById(id, userId)
    if (!client) throw new AppError(ErrorCode.CLIENT_NOT_FOUND)
    return client
  },

  async create(userId: string, input: CreateClientInput) {
    return clientRepository.create(userId, {
      name:           input.name,
      email:          input.email,
      phone:          input.phone,
      company:        input.company,
      address:        input.address,
      city:           input.city,
      state:          input.state,
      notes:          input.notes,
      status:         input.status ?? "LEAD",
      meetingStatus:  input.meetingStatus ?? "NOT_SCHEDULED",
      meetingType:    input.meetingType,
      meetingDate:    input.meetingDate,
      meetingSummary: input.meetingSummary,
    })
  },

  async update(id: string, userId: string, input: UpdateClientInput) {
    await this.getById(id, userId)
    await clientRepository.update(id, userId, input as Parameters<typeof clientRepository.update>[2])
    return clientRepository.findById(id, userId)
  },

  async delete(id: string, userId: string) {
    await this.getById(id, userId)
    await clientRepository.delete(id, userId)
  },

  async getProposals(clientId: string, userId: string) {
    await this.getById(clientId, userId)
    return clientRepository.findProposals(clientId, userId)
  },
}
