import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const followUpRepository = {
  findById(id: string, userId: string) {
    return prisma.followUp.findFirst({ where: { id, userId } })
  },

  findByOpportunity(opportunityId: string) {
    return prisma.followUp.findMany({
      where:   { opportunityId },
      orderBy: { nextContactDate: "asc" },
    })
  },

  findPending(userId: string) {
    return prisma.followUp.findMany({
      where:   { userId, completed: false },
      orderBy: { nextContactDate: "asc" },
      include: {
        opportunity: { select: { id: true, title: true, stage: true, client: { select: { name: true } } } },
      },
    })
  },

  findOverdue(userId: string) {
    return prisma.followUp.findMany({
      where: { userId, completed: false, nextContactDate: { lt: new Date() } },
      include: {
        opportunity: { select: { id: true, title: true, client: { select: { name: true } } } },
      },
    })
  },

  create(data: Prisma.FollowUpCreateInput) {
    return prisma.followUp.create({ data })
  },

  update(id: string, userId: string, data: Prisma.FollowUpUpdateInput) {
    return prisma.followUp.updateMany({ where: { id, userId }, data })
  },

  delete(id: string, userId: string) {
    return prisma.followUp.deleteMany({ where: { id, userId } })
  },
}
