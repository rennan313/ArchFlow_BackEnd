import type { AutomationKey, AutomationResultType } from "@prisma/client"
import { automationRepository } from "@/repositories/automation.repository"
import { projectRepository } from "@/repositories/project.repository"
import { proposalRepository } from "@/repositories/proposal.repository"
import { followUpRepository } from "@/repositories/followup.repository"
import { AUTOMATION_DEFINITIONS, AUTOMATION_KEYS } from "@/lib/automations"
import { AppError, ErrorCode } from "@/lib/errors"

const STALE_PROPOSAL_DAYS = 7
const OVERDUE_ALERT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export const automationService = {
  /** Idempotent — safe to call on every read of the Automações screen / dashboard widget. */
  async ensureDefaults(workspaceId: string) {
    await Promise.all(
      AUTOMATION_KEYS.map((key) => automationRepository.upsertDefault(workspaceId, key, AUTOMATION_DEFINITIONS[key])),
    )
  },

  /** Cheap read used inside hot paths (opportunity/project/client/meeting hooks) — no upsert here. */
  async isEnabled(workspaceId: string, key: AutomationKey): Promise<boolean> {
    const row = await automationRepository.isEnabled(workspaceId, key)
    return row?.enabled ?? true // default enabled until the workspace's Automation row is materialized
  },

  record(
    workspaceId: string,
    key: AutomationKey,
    input: { resultType: AutomationResultType; entityType: string; entityId: string; message?: string },
  ) {
    return automationRepository.createRun({ workspaceId, key, ...input })
  },

  async setEnabled(id: string, workspaceId: string, enabled: boolean) {
    await this.ensureDefaults(workspaceId) // guarantee the row exists before toggling
    const automation = await automationRepository.findById(id, workspaceId)
    if (!automation) throw new AppError(ErrorCode.AUTOMATION_NOT_FOUND)
    await automationRepository.setEnabled(id, workspaceId, enabled)
    return automationRepository.findById(id, workspaceId)
  },

  async listWithStats(workspaceId: string) {
    await this.ensureDefaults(workspaceId)
    await this.runScheduledChecks(workspaceId)

    const [automations, lastRuns, todayRuns] = await Promise.all([
      automationRepository.findAllByWorkspace(workspaceId),
      automationRepository.lastRunByKey(workspaceId),
      automationRepository.countTodayByKey(workspaceId, startOfToday()),
    ])

    const lastRunByKey = new Map(lastRuns.map((r) => [r.key, r._max.createdAt]))
    const todayByKey    = new Map(todayRuns.map((r) => [r.key, r._count._all]))

    return automations.map((a) => ({
      id:            a.id,
      key:           a.key,
      name:          a.name,
      description:   a.description,
      trigger:       a.trigger,
      enabled:       a.enabled,
      lastRunAt:     lastRunByKey.get(a.key) ?? null,
      executedToday: todayByKey.get(a.key) ?? 0,
    }))
  },

  async getDashboardStats(workspaceId: string) {
    await this.runScheduledChecks(workspaceId)

    const todayByResult = await automationRepository.countTodayByResultType(workspaceId, startOfToday())
    const countOf = (type: AutomationResultType) => todayByResult.find((r) => r.resultType === type)?._count._all ?? 0

    return {
      executedToday:    todayByResult.reduce((sum, r) => sum + r._count._all, 0),
      projectsCreated:  countOf("PROJECT_CREATED"),
      followUpsCreated: countOf("FOLLOWUP_CREATED"),
      alertsGenerated:  countOf("ALERT_GENERATED"),
    }
  },

  /** On-demand evaluation of the two time-based rules — no cron, runs inside normal request handling. */
  async runScheduledChecks(workspaceId: string) {
    await Promise.all([this.checkOverdueProjects(workspaceId), this.checkStaleProposals(workspaceId)])
  },

  async checkOverdueProjects(workspaceId: string) {
    if (!(await this.isEnabled(workspaceId, "PROJECT_OVERDUE_ALERT"))) return

    const overdueProjects = await projectRepository.findOverdue(workspaceId)
    if (overdueProjects.length === 0) return

    const since = new Date(Date.now() - OVERDUE_ALERT_DEDUP_WINDOW_MS)
    // Batched — one query for every overdue project instead of one query per
    // project. The per-item version measurably added hundreds of ms on every
    // dashboard load once the workspace had a few hundred projects.
    const alreadyAlerted = await automationRepository.findRecentRunEntityIds(
      workspaceId, "PROJECT_OVERDUE_ALERT", overdueProjects.map((p) => p.id), since,
    )

    for (const project of overdueProjects) {
      if (alreadyAlerted.has(project.id)) continue
      await this.record(workspaceId, "PROJECT_OVERDUE_ALERT", {
        resultType: "ALERT_GENERATED",
        entityType: "Project",
        entityId:   project.id,
        message:    `Projeto "${project.name}" está atrasado`,
      })
    }
  },

  async checkStaleProposals(workspaceId: string) {
    if (!(await this.isEnabled(workspaceId, "PROPOSAL_STALE_FOLLOWUP"))) return

    const cutoff = new Date(Date.now() - STALE_PROPOSAL_DAYS * 24 * 60 * 60 * 1000)
    const staleProposals = (await proposalRepository.findStaleSent(workspaceId, cutoff))
      // A proposal with neither link has nothing to scope the follow-up to — skip
      // rather than create an orphaned FollowUp that no UI can ever surface.
      .filter((p) => p.opportunityId || p.clientId)
    if (staleProposals.length === 0) return

    const opportunityIds = staleProposals.filter((p) => p.opportunityId).map((p) => p.opportunityId as string)
    const clientIds      = staleProposals.filter((p) => !p.opportunityId && p.clientId).map((p) => p.clientId as string)
    const existing = await followUpRepository.findExistingProposalAutomationLinks(workspaceId, opportunityIds, clientIds)

    for (const proposal of staleProposals) {
      const alreadyLinked = proposal.opportunityId
        ? existing.opportunityIds.has(proposal.opportunityId)
        : existing.clientIds.has(proposal.clientId as string)
      if (alreadyLinked) continue

      await followUpRepository.create({
        workspaceId,
        userId:          proposal.userId,
        opportunityId:   proposal.opportunityId,
        clientId:        proposal.opportunityId ? null : proposal.clientId,
        title:           "Entrar em contato com cliente",
        nextContactDate: new Date(),
        source:          "AUTOMATION",
      })
      await this.record(workspaceId, "PROPOSAL_STALE_FOLLOWUP", {
        resultType: "FOLLOWUP_CREATED",
        entityType: "Proposal",
        entityId:   proposal.id,
        message:    `Proposta de ${proposal.clientName} sem movimentação há ${STALE_PROPOSAL_DAYS}+ dias`,
      })
    }
  },
}
