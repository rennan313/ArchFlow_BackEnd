import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const briefingRepository = {
  findByOpportunity(opportunityId: string) {
    return prisma.briefing.findUnique({ where: { opportunityId } })
  },

  upsert(opportunityId: string, data: Omit<Prisma.BriefingCreateInput, "opportunity">) {
    return prisma.briefing.upsert({
      where:  { opportunityId },
      create: { ...data, opportunity: { connect: { id: opportunityId } } },
      update: data,
    })
  },

  delete(opportunityId: string) {
    return prisma.briefing.deleteMany({ where: { opportunityId } })
  },
}
