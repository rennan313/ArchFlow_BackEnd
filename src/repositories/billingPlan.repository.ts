import { prisma } from "@/lib/prisma"
import type { Plan, Prisma } from "@prisma/client"

export const billingPlanRepository = {
  /** All active plans, ordered for display (Story 4 — plans page). */
  findActive() {
    return prisma.billingPlan.findMany({
      where:   { active: true },
      orderBy: { order: "asc" },
    })
  },

  findAll() {
    return prisma.billingPlan.findMany({ orderBy: { order: "asc" } })
  },

  findByKey(key: Plan) {
    return prisma.billingPlan.findUnique({ where: { key } })
  },

  upsertByKey(key: Plan, data: Omit<Prisma.BillingPlanUncheckedCreateInput, "key">) {
    return prisma.billingPlan.upsert({
      where:  { key },
      create: { key, ...data },
      update: data,
    })
  },
}
