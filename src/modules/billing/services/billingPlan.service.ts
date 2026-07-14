import { billingPlanRepository } from "@/repositories/billingPlan.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { BillingPlan, Plan } from "@prisma/client"
import type { BillingCycle } from "../providers/gateway.interface"

// Read-side of the persisted plan catalog (Story 3/4). The enforcement limits
// still come from config/plans.ts; this serves pricing + display + the Mercado
// Pago plan mapping.
export const billingPlanService = {
  listActive(): Promise<BillingPlan[]> {
    return billingPlanRepository.findActive()
  },

  /** A plan that can be subscribed to online — active with a real price.
   *  ENTERPRISE (contact-sales, price 0 / inactive) is rejected here. */
  async getSellablePlan(key: Plan): Promise<BillingPlan> {
    const plan = await billingPlanRepository.findByKey(key)
    if (!plan) throw new AppError(ErrorCode.BILLING_PLAN_NOT_FOUND)
    if (!plan.active || plan.priceMonthly <= 0) throw new AppError(ErrorCode.BILLING_PLAN_NOT_SELLABLE)
    return plan
  },

  priceFor(plan: BillingPlan, cycle: BillingCycle): number {
    return cycle === "ANNUAL" ? plan.priceAnnual : plan.priceMonthly
  },

  mpPlanIdFor(plan: BillingPlan, cycle: BillingCycle): string | null {
    return cycle === "ANNUAL" ? plan.mpPreapprovalPlanIdAnnual : plan.mpPreapprovalPlanIdMonthly
  },
}
