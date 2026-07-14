import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const subscriptionRepository = {
  findByWorkspace(workspaceId: string) {
    return prisma.subscription.findUnique({ where: { workspaceId } })
  },

  findById(id: string) {
    return prisma.subscription.findUnique({ where: { id } })
  },

  /** Resolve a subscription from a gateway webhook by its provider id. findFirst
   *  (not findUnique) because mpSubscriptionId has no Prisma @unique — its
   *  uniqueness is enforced by the sparse index in docs/indexes.md. */
  findByMpSubscriptionId(mpSubscriptionId: string) {
    return prisma.subscription.findFirst({ where: { mpSubscriptionId } })
  },

  create(data: Prisma.SubscriptionUncheckedCreateInput) {
    return prisma.subscription.create({ data })
  },

  update(workspaceId: string, data: Prisma.SubscriptionUpdateInput) {
    return prisma.subscription.update({ where: { workspaceId }, data })
  },
}
