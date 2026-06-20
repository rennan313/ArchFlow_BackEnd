import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

// FollowUp has no workspaceId column of its own — it's always reached through
// an Opportunity, which does carry workspaceId, so every tenant-scoped query
// here filters through that relation instead of adding a redundant column.
export const followUpRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.followUp.findFirst({ where: { id, opportunity: { workspaceId } } })
  },

  findByOpportunity(opportunityId: string) {
    return prisma.followUp.findMany({
      where:   { opportunityId },
      orderBy: { nextContactDate: "asc" },
    })
  },

  findPending(workspaceId: string) {
    return prisma.followUp.findMany({
      where:   { completed: false, opportunity: { workspaceId } },
      orderBy: { nextContactDate: "asc" },
      include: {
        opportunity: { select: { id: true, title: true, stage: true, client: { select: { name: true } } } },
      },
    })
  },

  findOverdue(workspaceId: string) {
    return prisma.followUp.findMany({
      where: { completed: false, nextContactDate: { lt: new Date() }, opportunity: { workspaceId } },
      include: {
        opportunity: { select: { id: true, title: true, client: { select: { name: true } } } },
      },
    })
  },

  create(data: Prisma.FollowUpCreateInput) {
    return prisma.followUp.create({ data })
  },

  update(id: string, workspaceId: string, data: Prisma.FollowUpUpdateInput) {
    return prisma.followUp.updateMany({ where: { id, opportunity: { workspaceId } }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.followUp.deleteMany({ where: { id, opportunity: { workspaceId } } })
  },
}
