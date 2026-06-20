import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const billingHistoryRepository = {
  create(data: Prisma.BillingHistoryUncheckedCreateInput) {
    return prisma.billingHistory.create({ data })
  },

  findBySubscription(subscriptionId: string) {
    return prisma.billingHistory.findMany({
      where:   { subscriptionId },
      orderBy: { createdAt: "desc" },
    })
  },

  findByMpPaymentId(mpPaymentId: string) {
    return prisma.billingHistory.findFirst({ where: { mpPaymentId } })
  },
}
