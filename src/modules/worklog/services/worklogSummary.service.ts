import { prisma } from "@/lib/prisma"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import { timeEntryRepository } from "@/repositories/timeEntry.repository"
import { projectRepository } from "@/repositories/project.repository"
import { proposalRepository } from "@/repositories/proposal.repository"
import { timed } from "@/lib/metrics"

// Same cross-cutting-aggregate exception as financialDashboard.service.ts/
// projectFinancialSummary.service.ts — this reads across TimeEntry/Project/
// Proposal/ActivityCategory/User for a single project, which doesn't belong
// to any one repository. Category/user *names* are resolved here directly
// via prisma (not activityCategoryRepository/userRepository) for the same
// reason: groupBy() can't include() a relation, so the id→name join has to
// happen at this layer regardless of which repository ran the groupBy.

// Monday-start ISO week bucket key, e.g. "2026-07-13" — UTC to avoid
// timezone drift shifting entries near midnight into the wrong week.
function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const worklogSummaryService = {
  getProjectSummary(projectId: string, workspaceId: string, scopedUserId: string | null) {
    return timed("worklog.projectSummary.getSummary", () => worklogSummaryService.computeProjectSummary(projectId, workspaceId, scopedUserId))
  },

  async computeProjectSummary(projectId: string, workspaceId: string, scopedUserId: string | null) {
    await assertWorkspaceReferences(workspaceId, { projectId })

    const project = await projectRepository.findById(projectId, workspaceId)
    const proposal = project?.proposalId ? await proposalRepository.findById(project.proposalId, workspaceId) : null
    const estimatedHours = proposal?.estimatedHours ?? null

    const { byBillable, byCategory, byUser, entries } = await timeEntryRepository.aggregateByProject(projectId, workspaceId, scopedUserId)

    const categoryIds = byCategory.map((c) => c.categoryId).filter((id): id is string => !!id)
    const userIds = byUser.map((u) => u.userId)

    const [categories, users] = await Promise.all([
      categoryIds.length ? prisma.activityCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ])
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
    const userNameById = new Map(users.map((u) => [u.id, u.name]))

    const billableSeconds    = byBillable.find((b) => b.isBillable)?._sum.durationSeconds ?? 0
    const nonBillableSeconds = byBillable.find((b) => !b.isBillable)?._sum.durationSeconds ?? 0
    const totalWorkedSeconds = billableSeconds + nonBillableSeconds

    const estimatedSeconds = estimatedHours != null ? Math.round(estimatedHours * 3600) : null
    const remainingSeconds = estimatedSeconds != null ? Math.max(0, estimatedSeconds - totalWorkedSeconds) : null

    const distinctDays = new Set(entries.map((e) => dayKey(e.startedAt)))
    const avgDailySeconds = distinctDays.size > 0 ? Math.round(totalWorkedSeconds / distinctDays.size) : 0

    const weeklyTotals = new Map<string, number>()
    for (const e of entries) {
      const key = weekKey(e.startedAt)
      weeklyTotals.set(key, (weeklyTotals.get(key) ?? 0) + (e.durationSeconds ?? 0))
    }
    const weeklyEvolution = [...weeklyTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, seconds]) => ({ week, seconds }))

    return {
      estimatedHours,
      totalWorkedSeconds,
      billableSeconds,
      nonBillableSeconds,
      remainingSeconds,
      avgDailySeconds,
      collaboratorCount: byUser.length,
      entryCount: entries.length,
      byCategory: byCategory
        .map((c) => ({
          categoryId: c.categoryId,
          name: c.categoryId ? categoryNameById.get(c.categoryId) ?? "—" : "Sem categoria",
          seconds: c._sum.durationSeconds ?? 0,
        }))
        .sort((a, b) => b.seconds - a.seconds),
      byUser: byUser
        .map((u) => ({
          userId: u.userId,
          name: userNameById.get(u.userId) ?? "—",
          seconds: u._sum.durationSeconds ?? 0,
        }))
        .sort((a, b) => b.seconds - a.seconds),
      weeklyEvolution,
    }
  },
}
