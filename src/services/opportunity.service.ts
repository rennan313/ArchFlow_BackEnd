import { opportunityRepository } from "@/repositories/opportunity.repository"
import { projectRepository } from "@/repositories/project.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { STAGE_PROBABILITY } from "@/validations/opportunity"
import { automationService } from "@/services/automation.service"
import type { ProjectType } from "@/validations/project"
import type { CreateOpportunityInput, UpdateOpportunityInput, OpportunityQueryInput } from "@/validations/opportunity"

const PROJECT_TYPE_BY_LABEL: Record<string, ProjectType> = {
  residencial: "RESIDENTIAL", comercial: "COMMERCIAL", reforma: "RENOVATION",
  interiores: "INTERIOR", urbanismo: "URBAN", paisagismo: "LANDSCAPE",
}

function inferProjectType(label: string): ProjectType {
  return PROJECT_TYPE_BY_LABEL[label.trim().toLowerCase()] ?? "RESIDENTIAL"
}

interface ApprovedOpportunity {
  id:               string
  userId:           string
  clientId:         string
  title:            string
  projectType:      string
  squareMeters:     number | null
  city:             string | null
  state:            string | null
  estimatedRevenue: number | null
  proposals?:       { id: string }[]
}

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
    // Centralized cross-tenant guard (src/lib/tenantGuard.ts) — replaces the
    // ad-hoc clientRepository.findById check that used to live only here;
    // project/meeting create lacked the equivalent check (Fase 5 audit, P0 #1).
    await assertWorkspaceReferences(workspaceId, { clientId: input.clientId })

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
    const before = await this.getById(id, workspaceId)

    const updateData: Record<string, unknown> = { ...input }

    // Auto-update probability when stage changes (unless manually overridden)
    if (input.stage && input.probability === undefined) {
      updateData.probability = STAGE_PROBABILITY[input.stage]
    }

    await opportunityRepository.update(id, workspaceId, updateData)
    const after = await this.getById(id, workspaceId)

    if (input.stage === "APPROVED" && before.stage !== "APPROVED") {
      await this.autoCreateProjectOnApproval(workspaceId, after)
    }

    return after
  },

  // Automação 01 — Opportunity.stage = APPROVED → cria Project automaticamente
  // (cliente vinculado, fase inicial Briefing, proposta mais recente vinculada se houver).
  async autoCreateProjectOnApproval(workspaceId: string, opportunity: ApprovedOpportunity) {
    if (!(await automationService.isEnabled(workspaceId, "AUTO_CREATE_PROJECT_ON_APPROVED"))) return

    // Idempotency guard — a retried/concurrent request re-approving the same
    // opportunity (or a no-op update made while it's already APPROVED) must
    // not create a second Project. Project.opportunityId is deliberately NOT
    // a DB-level unique index (MongoDB's unique-on-optional-field semantics
    // would reject every second project that has no opportunityId at all),
    // so this read-then-write check is the only guard — a residual race
    // between two concurrent approvals of the exact same opportunity is
    // accepted, matching the soft-dedup pattern used by the other automations.
    const existing = await projectRepository.findByOpportunityId(opportunity.id, workspaceId)
    if (existing) return

    const latestProposalId = opportunity.proposals?.[0]?.id

    const project = await projectRepository.create(workspaceId, opportunity.userId, {
      clientId:         opportunity.clientId,
      opportunityId:    opportunity.id,
      ...(latestProposalId ? { proposalId: latestProposalId } : {}),
      name:             opportunity.title,
      type:             inferProjectType(opportunity.projectType),
      phase:            "BRIEFING",
      squareMeters:     opportunity.squareMeters,
      city:             opportunity.city,
      state:            opportunity.state,
      contractValue:    opportunity.estimatedRevenue,
    })

    await automationService.record(workspaceId, "AUTO_CREATE_PROJECT_ON_APPROVED", {
      resultType: "PROJECT_CREATED",
      entityType: "Project",
      entityId:   project.id,
      message:    `Projeto "${project.name}" criado a partir da oportunidade aprovada`,
    })
  },

  // CORE-2 (Sprint 0) — same referential guard as project.service.ts/
  // client.service.ts (RC-2.3), one hop upstream: an approved Opportunity
  // that already auto-created a Project (autoCreateProjectOnApproval above)
  // can no longer be deleted physically — Project.opportunityId would dangle,
  // and that Project may itself have financial history. Delete/reassign the
  // Project first. See FINANCIAL_ARCHITECTURE_DECISIONS.md, Anexo B.
  async delete(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    const linkedProject = await projectRepository.findByOpportunityId(id, workspaceId)
    if (linkedProject) throw new AppError(ErrorCode.OPPORTUNITY_HAS_PROJECT)
    await opportunityRepository.delete(id, workspaceId)
  },
}

function withWeightedRevenue<T extends { estimatedRevenue?: number | null; probability: number }>(opp: T) {
  const weightedRevenue = opp.estimatedRevenue != null
    ? Math.round(opp.estimatedRevenue * opp.probability) / 100
    : null
  return { ...opp, weightedRevenue }
}
