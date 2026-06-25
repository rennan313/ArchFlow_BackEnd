import { clientRepository } from "@/repositories/client.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { automationService } from "@/services/automation.service"
import type { CreateClientInput, UpdateClientInput, ClientQueryInput } from "@/validations/client"

export const clientService = {
  async list(workspaceId: string, query: ClientQueryInput) {
    const { data, total } = await clientRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const client = await clientRepository.findById(id, workspaceId)
    if (!client) throw new AppError(ErrorCode.CLIENT_NOT_FOUND)
    return client
  },

  async create(workspaceId: string, userId: string, input: CreateClientInput) {
    const client = await clientRepository.create(workspaceId, userId, {
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

    // Automação 09 — a timeline em si é derivada/computada na tela do cliente
    // (sem model novo); este log só confirma a inicialização para o widget.
    if (await automationService.isEnabled(workspaceId, "CLIENT_TIMELINE_INIT")) {
      await automationService.record(workspaceId, "CLIENT_TIMELINE_INIT", {
        resultType: "TIMELINE_INITIALIZED",
        entityType: "Client",
        entityId:   client.id,
        message:    `Timeline iniciada para ${client.name}`,
      })
    }

    return client
  },

  async update(id: string, workspaceId: string, input: UpdateClientInput) {
    await this.getById(id, workspaceId)
    await clientRepository.update(id, workspaceId, input as Parameters<typeof clientRepository.update>[2])
    return clientRepository.findById(id, workspaceId)
  },

  async delete(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    await clientRepository.delete(id, workspaceId)
  },

  async getProposals(clientId: string, workspaceId: string) {
    await this.getById(clientId, workspaceId)
    return clientRepository.findProposals(clientId, workspaceId)
  },
}
