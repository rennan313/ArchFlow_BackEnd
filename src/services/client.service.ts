import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { clientRepository } from "@/repositories/client.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { automationService } from "@/services/automation.service"
import { financialDocumentService } from "@/modules/financial/financial.module"
import type { CreateClientInput, UpdateClientInput, ClientQueryInput } from "@/validations/client"

type Db = typeof prisma | Prisma.TransactionClient

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

  // RC-2.3 — same reasoning as project.service.ts#delete. Client already
  // has a natural archive fallback (status: "INACTIVE") — the error
  // message points callers at it directly.
  async delete(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    if (await financialDocumentService.hasDocumentsForClient(id, workspaceId)) {
      throw new AppError(ErrorCode.CLIENT_HAS_FINANCIAL_HISTORY)
    }
    await clientRepository.delete(id, workspaceId)
  },

  async getProposals(clientId: string, workspaceId: string) {
    await this.getById(clientId, workspaceId)
    return clientRepository.findProposals(clientId, workspaceId)
  },

  /** Resolves a client for a new Proposal: reuses `opts.clientId` if the
   *  caller already picked one from search (ownership re-checked against
   *  `workspaceId` — never trust a clientId without this), otherwise reuses
   *  an existing client with the exact same name, otherwise creates a
   *  minimal one (name only). Pass `db` as a transaction client to run this
   *  atomically alongside the Proposal creation. */
  async findOrCreate(
    workspaceId: string,
    userId: string,
    opts: { clientId?: string; name: string },
    db: Db = prisma,
  ) {
    if (opts.clientId) {
      const existing = await clientRepository.findById(opts.clientId, workspaceId, db)
      if (!existing) throw new AppError(ErrorCode.CLIENT_NOT_FOUND)
      return existing
    }

    const existing = await clientRepository.findByExactName(workspaceId, opts.name, db)
    if (existing) return existing

    return clientRepository.create(workspaceId, userId, { name: opts.name }, db)
  },
}
