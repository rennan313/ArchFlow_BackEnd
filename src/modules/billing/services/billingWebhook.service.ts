import { logger } from "@/lib/logger"
import { billingService } from "@/services/billing.service"
import { subscriptionService } from "@/services/subscription.service"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { getBillingProvider } from "../providers"
import type { BillingGatewayProvider, GatewayEventRef, GatewaySubscription, GatewayPayment } from "../providers/gateway.interface"
import type { MpPayment } from "../providers/mercadoPago/mp.types"
import type { PlanName } from "@/config/plans"
import type { Subscription } from "@prisma/client"

type Resolved = { subscription: Subscription; remote: GatewaySubscription | GatewayPayment }

// The billing state machine (Stories 6/7/8/12). Turns a normalized gateway
// event into Subscription/Payment/Workspace updates. Every transition is
// idempotent and reentrant: the same event re-run must converge to the same
// state (so MP retries and duplicate deliveries are safe). Nothing here knows
// Mercado Pago's wire format — that stays in the provider.
export const billingWebhookService = {
  async process(ref: GatewayEventRef, rawBody: string): Promise<void> {
    const provider = getBillingProvider()

    const resolved = ref.type === "subscription"
      ? await resolveFromSubscription(provider, ref)
      : await resolveFromPayment(provider, ref)

    if (!resolved) {
      logger.warn({ ref }, "[billing] webhook for unknown subscription — acked, not processed")
      return
    }
    const { subscription, remote } = resolved

    // Persist BEFORE processing, idempotent by externalId (Story 6/12).
    const event = await billingService.recordPaymentEvent({
      subscriptionId: subscription.id,
      provider:       provider.id,
      externalId:     ref.externalId,
      type:           ref.action ?? ref.type,
      rawPayload:     rawBody || JSON.stringify(remote.raw),
    })
    if (event.processedAt) {
      logger.info({ externalId: ref.externalId }, "[billing] duplicate webhook — already processed")
      return
    }

    try {
      if (ref.type === "subscription") await applySubscription(subscription, remote as GatewaySubscription)
      else                             await applyPayment(provider, subscription, remote as GatewayPayment)
      await billingService.markEventProcessed(event.id, "processed")
    } catch (err) {
      // Persist the failure and rethrow so the route replies 500 → MP retries →
      // this same event reprocesses idempotently (Story 12 retry/reprocess).
      await billingService.markEventProcessed(event.id, "failed").catch(() => {})
      throw err
    }
  },
}

// ─── Resolution ────────────────────────────────────────────────────────────────

async function resolveFromSubscription(provider: BillingGatewayProvider, ref: GatewayEventRef): Promise<Resolved | null> {
  const remote = await provider.getSubscription(ref.resourceId)
  const subscription = await subscriptionRepository.findByMpSubscriptionId(ref.resourceId)
  return subscription ? { subscription, remote } : null
}

async function resolveFromPayment(provider: BillingGatewayProvider, ref: GatewayEventRef): Promise<Resolved | null> {
  const remote = await provider.getPayment(ref.resourceId)
  const externalRef = (remote.raw as MpPayment).external_reference
  const subscription = externalRef ? await subscriptionRepository.findById(externalRef) : null
  return subscription ? { subscription, remote } : null
}

// ─── Transitions ────────────────────────────────────────────────────────────────

async function applySubscription(sub: Subscription, remote: GatewaySubscription): Promise<void> {
  switch (remote.status) {
    case "authorized":
      // Activate: sync Workspace.plan + status ACTIVE (one transaction), then
      // set the billing period. changePlan is the single writer of both fields.
      await subscriptionService.changePlan(sub.workspaceId, sub.plan as PlanName, sub.billingCycle)
      await subscriptionRepository.update(sub.workspaceId, {
        currentPeriodStart: new Date(),
        currentPeriodEnd:   remote.nextPaymentDate ?? null,
        cancelAtPeriodEnd:  false,
        canceledAt:         null,
      })
      logger.info({ workspaceId: sub.workspaceId, plan: sub.plan }, "[billing] subscription authorized → ACTIVE")
      // TODO(Fase C): emailService.sendSubscriptionCreated(...)
      break
    case "paused":
      await subscriptionRepository.update(sub.workspaceId, { status: "PAUSED" })
      logger.info({ workspaceId: sub.workspaceId }, "[billing] subscription paused")
      // TODO(Fase C): emailService.sendSubscriptionPaused(...)
      break
    case "cancelled":
      if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()) {
        // User-initiated cancel-at-period-end: gateway renewal is stopped, but
        // keep local access until the paid period ends. A reconciliation job
        // (next sprint) flips this to CANCELED at currentPeriodEnd.
        logger.info({ workspaceId: sub.workspaceId, until: sub.currentPeriodEnd }, "[billing] cancel scheduled at period end — access retained")
      } else {
        await subscriptionRepository.update(sub.workspaceId, { status: "CANCELED", canceledAt: new Date() })
        logger.info({ workspaceId: sub.workspaceId }, "[billing] subscription cancelled")
      }
      // TODO(Fase C): emailService.sendSubscriptionCanceled(...)
      break
    case "pending":
    default:
      // Awaiting first authorization — no access change.
      break
  }
}

async function applyPayment(provider: BillingGatewayProvider, sub: Subscription, remote: GatewayPayment): Promise<void> {
  const description = `Assinatura ArchFlow — ${sub.plan}`

  if (remote.status === "approved") {
    await billingService.recordInvoice({
      subscriptionId: sub.id,
      amount:         remote.amount,
      currency:       remote.currency,
      status:         "paid",
      description,
      paidAt:         remote.paidAt ?? undefined,
      mpPaymentId:    remote.providerPaymentId,
      receiptUrl:     remote.receiptUrl ?? undefined,
      rawPayload:     JSON.stringify(remote.raw),
    })
    // Ensure ACTIVE + plan synced (covers first payment AND renewals).
    await subscriptionService.changePlan(sub.workspaceId, sub.plan as PlanName, sub.billingCycle)
    // Refresh the period end from the preapproval's next payment date, if known.
    if (sub.mpSubscriptionId) {
      const remoteSub = await provider.getSubscription(sub.mpSubscriptionId).catch(() => null)
      if (remoteSub?.nextPaymentDate) {
        await subscriptionRepository.update(sub.workspaceId, { currentPeriodEnd: remoteSub.nextPaymentDate })
      }
    }
    logger.info({ workspaceId: sub.workspaceId, mpPaymentId: remote.providerPaymentId }, "[billing] payment approved")
    // TODO(Fase C): emailService.sendPaymentApproved(...) / sendRenewal(...)
    return
  }

  if (remote.status === "rejected") {
    await billingService.recordInvoice({
      subscriptionId: sub.id, amount: remote.amount, currency: remote.currency,
      status: "failed", description, mpPaymentId: remote.providerPaymentId, rawPayload: JSON.stringify(remote.raw),
    })
    await subscriptionRepository.update(sub.workspaceId, { status: "PAST_DUE" })
    logger.info({ workspaceId: sub.workspaceId }, "[billing] payment rejected → PAST_DUE")
    // TODO(Fase C): emailService.sendPaymentRejected(...)
    return
  }

  if (remote.status === "refunded" || remote.status === "charged_back") {
    await billingService.recordInvoice({
      subscriptionId: sub.id, amount: remote.amount, currency: remote.currency,
      status: remote.status === "refunded" ? "refunded" : "charged_back",
      description, mpPaymentId: remote.providerPaymentId, rawPayload: JSON.stringify(remote.raw),
    })
    await subscriptionRepository.update(sub.workspaceId, { status: "PAST_DUE" })
    logger.info({ workspaceId: sub.workspaceId, status: remote.status }, "[billing] payment refunded/charged_back → PAST_DUE")
    // TODO(Fase C): emailService.sendChargeback(...)
    return
  }

  // pending / cancelled payment statuses: nothing actionable yet.
}
