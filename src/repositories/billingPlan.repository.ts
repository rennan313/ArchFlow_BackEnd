import { prisma } from "@/lib/prisma"
import type { Plan } from "@prisma/client"

// Entitlements Sprint (2026-07) — BillingPlan is now versioned ([key,
// version] unique, see schema comment). "The plan for this key" always
// means "the current ACTIVE version for this key", never the newest row by
// creation order — a DEPRECATED version stays resolvable only via its exact
// id (planService.getVersion), for grandfathered subscribers.
export const billingPlanRepository = {
  /** All currently-sellable plan versions, ordered for display (Story 4 — plans page). */
  findActive() {
    return prisma.billingPlan.findMany({
      where:   { status: "ACTIVE" },
      orderBy: { order: "asc" },
    })
  },

  /** Every version of every plan, for admin/audit views — not display-filtered. */
  findAll() {
    return prisma.billingPlan.findMany({ orderBy: [{ key: "asc" }, { version: "asc" }] })
  },

  findByKey(key: Plan) {
    return prisma.billingPlan.findFirst({
      where:   { key, status: "ACTIVE" },
      orderBy: { version: "desc" },
    })
  },
}
