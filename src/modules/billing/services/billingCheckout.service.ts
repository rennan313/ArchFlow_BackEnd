import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { subscriptionService } from "@/services/subscription.service"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { getBillingProvider } from "../providers"
import { billingPlanService } from "./billingPlan.service"
import type { BillingCycle } from "../providers/gateway.interface"
import type { Plan } from "@prisma/client"

export interface CreateCheckoutInput {
  workspaceId: string
  planKey:     Plan
  cycle:       BillingCycle
  backUrl:     string
}

export interface CreateCheckoutResult {
  initPoint:              string
  providerSubscriptionId: string
}

async function resolveOwnerEmail(workspaceId: string): Promise<string> {
  const owner = await prisma.user.findFirst({
    where:   { workspaceId, workspaceRole: "OWNER" },
    select:  { email: true },
    orderBy: { createdAt: "asc" },
  })
  if (owner?.email) return owner.email
  const any = await prisma.user.findFirst({ where: { workspaceId }, select: { email: true } })
  if (!any?.email) throw new AppError(ErrorCode.USER_NOT_FOUND)
  return any.email
}

export const billingCheckoutService = {
  /**
   * Creates a Mercado Pago preapproval and links its id to the workspace's
   * Subscription. Deliberately grants NO access: status is left as-is (TRIAL/
   * EXPIRED) and Workspace.plan is untouched — only the authorization webhook
   * flips the workspace to ACTIVE. All checkout logic funnels through here
   * (Story 5), never through a route or a component.
   */
  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const provider = getBillingProvider()
    if (!provider.configured) throw new AppError(ErrorCode.BILLING_NOT_CONFIGURED)

    const plan   = await billingPlanService.getSellablePlan(input.planKey)
    const amount = billingPlanService.priceFor(plan, input.cycle)

    // Get-or-create the Subscription row so we have a stable externalReference
    // (its id) that every future webhook for this subscription echoes back.
    const sub        = await subscriptionService.ensureSubscription(input.workspaceId)
    const payerEmail = await resolveOwnerEmail(input.workspaceId)

    const result = await provider.createSubscription({
      reason:            `ArchFlow ${plan.name} (${input.cycle === "ANNUAL" ? "Anual" : "Mensal"})`,
      amount,
      currency:          "BRL",
      cycle:             input.cycle,
      payerEmail,
      externalReference: sub.id,
      backUrl:           input.backUrl,
      preapprovalPlanId: billingPlanService.mpPlanIdFor(plan, input.cycle),
    })

    if (!result.initPoint) throw new AppError(ErrorCode.BILLING_PROVIDER_ERROR, "Gateway returned no checkout URL")

    // Record the pending target (plan/cycle/provider id). Enforcement reads
    // Workspace.plan (unchanged here), so this stores intent without unlocking.
    await subscriptionRepository.update(input.workspaceId, {
      plan:             input.planKey,
      billingCycle:     input.cycle,
      mpSubscriptionId: result.providerSubscriptionId,
    })

    logger.info(
      { workspaceId: input.workspaceId, plan: input.planKey, cycle: input.cycle, mpSubscriptionId: result.providerSubscriptionId },
      "[billing] checkout created",
    )

    return { initPoint: result.initPoint, providerSubscriptionId: result.providerSubscriptionId }
  },
}
