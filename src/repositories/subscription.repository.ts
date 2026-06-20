import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const subscriptionRepository = {
  findByWorkspace(workspaceId: string) {
    return prisma.subscription.findUnique({ where: { workspaceId } })
  },

  findById(id: string) {
    return prisma.subscription.findUnique({ where: { id } })
  },

  create(data: Prisma.SubscriptionUncheckedCreateInput) {
    return prisma.subscription.create({ data })
  },

  update(workspaceId: string, data: Prisma.SubscriptionUpdateInput) {
    return prisma.subscription.update({ where: { workspaceId }, data })
  },
}
