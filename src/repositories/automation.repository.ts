import { prisma } from "@/lib/prisma"
import type { Prisma, AutomationKey, AutomationResultType } from "@prisma/client"

export const automationRepository = {
  findAllByWorkspace(workspaceId: string) {
    return prisma.automation.findMany({ where: { workspaceId } })
  },

  findById(id: string, workspaceId: string) {
    return prisma.automation.findFirst({ where: { id, workspaceId } })
  },

  upsertDefault(workspaceId: string, key: AutomationKey, data: { name: string; description: string; trigger: string }) {
    return prisma.automation.upsert({
      where:  { workspaceId_key: { workspaceId, key } },
      update: {},
      create: { workspaceId, key, ...data },
    })
  },

  setEnabled(id: string, workspaceId: string, enabled: boolean) {
    return prisma.automation.updateMany({ where: { id, workspaceId }, data: { enabled } })
  },

  isEnabled(workspaceId: string, key: AutomationKey) {
    return prisma.automation.findUnique({ where: { workspaceId_key: { workspaceId, key } }, select: { enabled: true } })
  },

  createRun(data: Prisma.AutomationRunUncheckedCreateInput) {
    return prisma.automationRun.create({ data })
  },

  lastRunByKey(workspaceId: string) {
    return prisma.automationRun.groupBy({
      by: ["key"],
      where: { workspaceId },
      _max: { createdAt: true },
    })
  },

  countTodayByKey(workspaceId: string, since: Date) {
    return prisma.automationRun.groupBy({
      by: ["key"],
      where: { workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
    })
  },

  countTodayByResultType(workspaceId: string, since: Date) {
    return prisma.automationRun.groupBy({
      by: ["resultType"],
      where: { workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
    })
  },

  /**
   * Batched form of findRecentRunForEntity — one query for N candidate entities
   * instead of one query per entity. Used by the on-demand scheduled checks
   * (checkOverdueProjects/checkStaleProposals), which loop over every overdue
   * project/stale proposal on every dashboard load; at a few hundred rows the
   * per-item version measurably adds hundreds of ms (confirmed under load test).
   */
  async findRecentRunEntityIds(workspaceId: string, key: AutomationKey, entityIds: string[], since: Date): Promise<Set<string>> {
    if (entityIds.length === 0) return new Set()
    const runs = await prisma.automationRun.findMany({
      where: { workspaceId, key, entityId: { in: entityIds }, createdAt: { gte: since } },
      select: { entityId: true },
    })
    return new Set(runs.map((r) => r.entityId))
  },
}

export type { AutomationResultType }
