import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const paymentEventRepository = {
  findByExternalId(externalId: string) {
    return prisma.paymentEvent.findUnique({ where: { externalId } })
  },

  create(data: Prisma.PaymentEventUncheckedCreateInput) {
    return prisma.paymentEvent.create({ data })
  },

  markProcessed(id: string, status: string) {
    return prisma.paymentEvent.update({
      where: { id },
      data:  { status, processedAt: new Date() },
    })
  },

  findBySubscription(subscriptionId: string) {
    return prisma.paymentEvent.findMany({
      where:   { subscriptionId },
      orderBy: { createdAt: "desc" },
    })
  },
}
