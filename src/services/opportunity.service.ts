import { prisma } from "@/lib/prisma"
import { opportunityRepository } from "@/repositories/opportunity.repository"
import { projectRepository } from "@/repositories/project.repository"
import { clientRepository } from "@/repositories/client.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { STAGE_PROBABILITY } from "@/validations/opportunity"
import { automationService } from "@/services/automation.service"
import { entityLifecycleService } from "@/services/entityLifecycle.service"
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
    const result = withWeightedRevenue(opp)

    // Kanban Sprint — Fase D (MEL-07). Quick-create-in-column lets a caller
    // create an Opportunity already in APPROVED — update() has always fired
    // autoCreateProjectOnApproval for that transition, but create() never
    // did (nothing could reach this path before MEL-07: the frontend never
    // sent `stage` on create). Mirrored here so "born approved" behaves the
    // same as "moved to approved" — same automation, same idempotency guard.
    if (result.stage === "APPROVED") {
      await this.autoCreateProjectOnApproval(workspaceId, result)
    }

    return result
  },

  // Kanban Sprint — Fase A (MEL-01). Side-effect map for Opportunity.stage
  // transitions (documented per the sprint's pre-implementation requirement
  // before any transition validation was added):
  //   * ANY stage → APPROVED (from a non-APPROVED stage) fires
  //     autoCreateProjectOnApproval below (Automação 01) — creates a Project.
  //   * Every other transition (including APPROVED → any other stage, i.e.
  //     "reopening" an approved opportunity) has NO side effect — it's a
  //     plain field update. Deliberately not blocked: users must be able to
  //     move cards freely forward/back (sprint direction — no rigid
  //     workflow), and re-approving later still hits the idempotency guard
  //     below, so nothing duplicates.
  // Protection strategy chosen (no rigid transition matrix — not needed,
  // since only one transition target has a side effect):
  //   1. Idempotency: autoCreateProjectOnApproval no-ops if a Project already
  //      exists for this opportunityId (pre-existing guard, unchanged).
  //   2. Concurrency: the update() call below now takes an optional
  //      expectedUpdatedAt (MEL-04) — when the caller supplies it (the
  //      Kanban board does, from Fase B onward), two concurrent "approve"
  //      requests can no longer BOTH observe before.stage !== "APPROVED":
  //      only the first's CAS write succeeds; the second gets STALE_WRITE
  //      (409) and never reaches autoCreateProjectOnApproval at all. This
  //      closes the residual race the original idempotency-guard comment
  //      below explicitly flagged as accepted/unclosed.
  async update(id: string, workspaceId: string, input: UpdateOpportunityInput) {
    const before = await this.getById(id, workspaceId)

    const { expectedUpdatedAt, ...rest } = input
    const updateData: Record<string, unknown> = { ...rest }

    // Auto-update probability when stage changes (unless manually overridden)
    if (input.stage && input.probability === undefined) {
      updateData.probability = STAGE_PROBABILITY[input.stage]
    }

    const result = await opportunityRepository.update(id, workspaceId, updateData, expectedUpdatedAt)
    if (expectedUpdatedAt && result.count === 0) {
      throw new AppError(ErrorCode.STALE_WRITE)
    }

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
    // so this read-then-write check is the primary guard. As of Fase A
    // (MEL-04), the residual race this comment used to accept as unclosed —
    // two concurrent approvals both passing this check before either writes
    // — is now closed one layer up in update() via optimistic concurrency,
    // whenever the caller supplies expectedUpdatedAt.
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
  // can no longer be archived (or deleted) — Project.opportunityId would
  // point at a hidden opportunity, and that Project may itself have
  // financial history. Delete/reassign the Project first. See
  // FINANCIAL_ARCHITECTURE_DECISIONS.md, Anexo B.
  async delete(id: string, workspaceId: string, userId: string) {
    await this.getById(id, workspaceId)
    await entityLifecycleService.archive({
      entity: "Opportunity", id, workspaceId, userId,
      delegate: prisma.opportunity,
      guard: async () => {
        const linkedProject = await projectRepository.findByOpportunityId(id, workspaceId)
        if (linkedProject) throw new AppError(ErrorCode.OPPORTUNITY_HAS_PROJECT)
      },
    })
  },

  // ADR-020 — an Opportunity always has a Client; restoring it while that
  // Client is still archived would put it back on the Kanban with no
  // reachable parent.
  async restore(id: string, workspaceId: string, userId: string) {
    const opp = await this.getById(id, workspaceId)
    await entityLifecycleService.restore({
      entity: "Opportunity", id, workspaceId, userId,
      delegate: prisma.opportunity,
      integrityCheck: async () => {
        const client = await clientRepository.findById(opp.clientId, workspaceId)
        if (client?.archived) throw new AppError(ErrorCode.PARENT_ARCHIVED)
      },
    })
    return this.getById(id, workspaceId)
  },
}

function withWeightedRevenue<T extends { estimatedRevenue?: number | null; probability: number }>(opp: T) {
  const weightedRevenue = opp.estimatedRevenue != null
    ? Math.round(opp.estimatedRevenue * opp.probability) / 100
    : null
  return { ...opp, weightedRevenue }
}
