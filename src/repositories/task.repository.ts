import { prisma } from "@/lib/prisma"
import type { Prisma, AutomationKey } from "@prisma/client"

export const taskRepository = {
  findByProject(projectId: string, workspaceId: string) {
    return prisma.task.findMany({ where: { projectId, workspaceId }, orderBy: { createdAt: "asc" } })
  },

  /** Idempotency guard for Automações 02-05 — has this phase's task already been created for this project? */
  findByProjectAndKey(projectId: string, workspaceId: string, automationKey: AutomationKey) {
    return prisma.task.findFirst({ where: { projectId, workspaceId, automationKey } })
  },

  findById(id: string, workspaceId: string) {
    return prisma.task.findFirst({ where: { id, workspaceId } })
  },

  create(data: Prisma.TaskUncheckedCreateInput) {
    return prisma.task.create({ data })
  },

  setStatus(id: string, workspaceId: string, status: "PENDING" | "DONE") {
    return prisma.task.updateMany({ where: { id, workspaceId }, data: { status } })
  },
}
