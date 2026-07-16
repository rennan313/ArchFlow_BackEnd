import { projectRepository } from "@/repositories/project.repository"
import { followUpRepository } from "@/repositories/followup.repository"
import { taskRepository } from "@/repositories/task.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { automationService } from "@/services/automation.service"
import { taskService } from "@/services/task.service"
import { financialDocumentService } from "@/modules/financial/financial.module"
import type { CreateProjectInput, UpdateProjectInput, ProjectQueryInput, ProjectPhase } from "@/validations/project"
import type { AutomationKey } from "@prisma/client"

const PROJECT_PHASES: ProjectPhase[] = [
  "BRIEFING", "PRELIMINARY_DESIGN", "EXECUTIVE_DESIGN", "COMPATIBILIZATION", "APPROVAL", "DELIVERY",
]

const TASK_ON_PHASE: Partial<Record<ProjectPhase, { key: AutomationKey; title: string }>> = {
  PRELIMINARY_DESIGN: { key: "TASK_PRELIMINARY_DESIGN", title: "Desenvolver Anteprojeto" },
  EXECUTIVE_DESIGN:   { key: "TASK_EXECUTIVE_DESIGN",   title: "Desenvolver Projeto Executivo" },
  COMPATIBILIZATION:  { key: "TASK_COMPATIBILIZATION",  title: "Compatibilizar disciplinas" },
  APPROVAL:           { key: "TASK_APPROVAL",           title: "Protocolar aprovação" },
}

const POST_DELIVERY_FOLLOWUP_DAYS = 30

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
    // P0 #1 (Fase 5 audit) — clientId/proposalId previously reached the
    // repository unvalidated, letting a workspace link a project to another
    // tenant's client. Every reference field from request input goes through
    // the centralized guard before any write.
    await assertWorkspaceReferences(workspaceId, { clientId: input.clientId, proposalId: input.proposalId })

    return projectRepository.create(workspaceId, userId, {
      clientId:         input.clientId,
      proposalId:       input.proposalId,
      name:             input.name,
      code:             input.code,
      description:      input.description,
      type:             input.type,
      status:           input.status ?? "BRIEFING",
      phase:            input.phase ?? "BRIEFING",
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
    // clientId is omitted from UpdateProjectInput (validations/project.ts), but
    // proposalId still reaches here from request input and needs the same guard.
    await assertWorkspaceReferences(workspaceId, { proposalId: input.proposalId })

    const before = await this.getById(id, workspaceId)
    await projectRepository.update(id, workspaceId, input as Parameters<typeof projectRepository.update>[2])
    const after = await this.getById(id, workspaceId)

    if (input.phase && input.phase !== before.phase) {
      await this.onPhaseChanged(workspaceId, after, input.phase)
    }

    return after
  },

  // Automações 02-05 — Project.phase muda para uma das 4 fases de execução → cria a tarefa correspondente.
  // Automação 10 — Project.phase = DELIVERY → cria follow-up pós-entrega em 30 dias.
  async onPhaseChanged(workspaceId: string, project: { id: string; name: string; userId: string; clientId: string }, newPhase: ProjectPhase) {
    const taskRule = TASK_ON_PHASE[newPhase]
    if (taskRule && (await automationService.isEnabled(workspaceId, taskRule.key))) {
      // Idempotency guard — a project re-entering a phase it already passed through
      // (revert + re-advance, or a retried request) must not create a duplicate task.
      const existingTask = await taskRepository.findByProjectAndKey(project.id, workspaceId, taskRule.key)
      if (!existingTask) {
        const task = await taskService.createAutomated(workspaceId, project.id, project.userId, taskRule.title, taskRule.key)
        await automationService.record(workspaceId, taskRule.key, {
          resultType: "TASK_CREATED",
          entityType: "Task",
          entityId:   task.id,
          message:    `Tarefa "${taskRule.title}" criada para o projeto "${project.name}"`,
        })
      }
    }

    if (
      newPhase === "DELIVERY" &&
      (await automationService.isEnabled(workspaceId, "POST_DELIVERY_FOLLOWUP")) &&
      !(await followUpRepository.findByProjectAutomation(project.id, workspaceId))
    ) {
      const nextContactDate = new Date(Date.now() + POST_DELIVERY_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000)
      const followUp = await followUpRepository.create({
        workspaceId,
        userId:          project.userId,
        projectId:       project.id,
        clientId:        project.clientId,
        title:           "Satisfação do Cliente",
        nextContactDate,
        source:          "AUTOMATION",
      })
      await automationService.record(workspaceId, "POST_DELIVERY_FOLLOWUP", {
        resultType: "FOLLOWUP_CREATED",
        entityType: "FollowUp",
        entityId:   followUp.id,
        message:    `Follow-up pós-entrega agendado para o projeto "${project.name}"`,
      })
    }
  },

  // RC-2.3 — a project with linked FinancialDocuments can never be hard
  // deleted: Mongo has no FK to cascade or block on, so a plain deleteMany
  // here would silently orphan every financial record's projectId (still
  // correct in aggregates, but unresolvable to a name in the UI —
  // exactly the gap the RC-1 audit flagged). There is no "archive" state
  // for Project to fall back to instead; the caller must cancel/reassign
  // the financial history first, or simply not delete a project with a
  // real financial footprint.
  async delete(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    if (await financialDocumentService.hasDocumentsForProject(id, workspaceId)) {
      throw new AppError(ErrorCode.PROJECT_HAS_FINANCIAL_HISTORY)
    }
    await projectRepository.delete(id, workspaceId)
  },

  async phaseStats(workspaceId: string) {
    const [groups, overdueCount] = await Promise.all([
      projectRepository.phaseStats(workspaceId),
      projectRepository.countOverdue(workspaceId),
    ])

    const byPhase = PROJECT_PHASES.reduce((acc, phase) => {
      acc[phase] = groups.find((g) => g.phase === phase)?._count._all ?? 0
      return acc
    }, {} as Record<ProjectPhase, number>)

    return { byPhase, overdueCount }
  },
}
