import { logger } from "@/lib/logger"
import { billingService } from "@/services/billing.service"
import { subscriptionService } from "@/services/subscription.service"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { billingPlanRepository } from "@/repositories/billingPlan.repository"
import { aiCreditPurchaseRepository } from "@/repositories/aiCreditPurchase.repository"
import { aiCreditService } from "@/services/billing/aiCredit.service"
import { emailService } from "@/services/email/email.service"
import { resolveOwnerContact, type OwnerContact } from "@/utils/workspaceOwner"
import { PLAN_LABELS, type PlanName } from "@/config/plans"
import { getBillingProvider } from "../providers"
import type { BillingGatewayProvider, GatewayEventRef, GatewaySubscription, GatewayPayment } from "../providers/gateway.interface"
import type { MpPayment } from "../providers/mercadoPago/mp.types"
import type { Subscription } from "@prisma/client"

// Fire-and-forget owner notification. Email delivery must NEVER break the
// webhook state machine (SMTP down, no owner, template error) — every failure
// is swallowed and logged. Resolves the recipient lazily so no-op events don't
// query for a contact they won't use.
async function notifyOwner(workspaceId: string, send: (c: OwnerContact) => Promise<void>): Promise<void> {
  try {
    const contact = await resolveOwnerContact(workspaceId)
    if (!contact) { logger.warn({ workspaceId }, "[billing] no owner contact — skipping email"); return }
    await send(contact)
  } catch (err) {
    logger.error({ workspaceId, err: String(err) }, "[billing] notification email failed (non-fatal)")
  }
}

function planLabel(plan: string): string {
  return PLAN_LABELS[plan as PlanName] ?? plan
}

type Resolved = { subscription: Subscription; remote: GatewaySubscription | GatewayPayment }

// AI Credit Purchase sprint (resumed) — the exact prefix
// aiCreditPurchase.service.ts#createCheckout puts on every credit-purchase
// external_reference. Checking this FIRST and unconditionally is what keeps
// the two financial domains (subscription vs. one-off credit pack) fully
// separated — routing is by this persisted, caller-controlled reference,
// never by amount/credits/plan/heuristics.
const CREDIT_PURCHASE_REF_PREFIX = "AI_CREDIT_PURCHASE:"

function parseCreditPurchaseId(externalReference: string | undefined): string | null {
  if (!externalReference?.startsWith(CREDIT_PURCHASE_REF_PREFIX)) return null
  return externalReference.slice(CREDIT_PURCHASE_REF_PREFIX.length)
}

// The billing state machine (Stories 6/7/8/12). Turns a normalized gateway
// event into Subscription/Payment/Workspace updates. Every transition is
// idempotent and reentrant: the same event re-run must converge to the same
// state (so MP retries and duplicate deliveries are safe). Nothing here knows
// Mercado Pago's wire format — that stays in the provider.
export const billingWebhookService = {
  async process(ref: GatewayEventRef, rawBody: string): Promise<void> {
    const provider = getBillingProvider()

    // Credit-purchase payments never enter the subscription resolution path
    // below (never resolveFromPayment, never applyPayment/changePlan) — a
    // one-off Checkout Pro payment for a credit pack falling into the
    // subscription-renewal handler would be a serious billing bug, so this
    // check runs first and unconditionally for every payment-type event.
    // (One extra provider.getPayment call is paid on ordinary subscription
    // payments too — an acceptable cost for keeping resolveFromPayment/
    // applyPayment below completely untouched by this sprint.)
    if (ref.type === "payment") {
      const payment    = await provider.getPayment(ref.resourceId)
      const purchaseId = parseCreditPurchaseId((payment.raw as MpPayment).external_reference)
      if (purchaseId) {
        await processCreditPurchasePayment(purchaseId, payment)
        return
      }
    }

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
      await notifyOwner(sub.workspaceId, async (c) => {
        const plan   = await billingPlanRepository.findByKey(sub.plan)
        const amount = plan ? (sub.billingCycle === "ANNUAL" ? plan.priceAnnual : plan.priceMonthly) : 0
        await emailService.sendSubscriptionCreated({
          to: c.email, name: c.name, planName: planLabel(sub.plan),
          cycle: sub.billingCycle, amount, nextBilling: remote.nextPaymentDate ?? null,
        })
      })
      break
    case "paused":
      await subscriptionRepository.update(sub.workspaceId, { status: "PAUSED" })
      logger.info({ workspaceId: sub.workspaceId }, "[billing] subscription paused")
      // TODO(Fase C): emailService.sendSubscriptionPaused(...)
      break
    case "cancelled": {
      const keepUntil = sub.cancelAtPeriodEnd && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
        ? sub.currentPeriodEnd
        : null
      if (keepUntil) {
        // User-initiated cancel-at-period-end: gateway renewal is stopped, but
        // keep local access until the paid period ends. A reconciliation job
        // (next sprint) flips this to CANCELED at currentPeriodEnd.
        logger.info({ workspaceId: sub.workspaceId, until: keepUntil }, "[billing] cancel scheduled at period end — access retained")
      } else {
        await subscriptionRepository.update(sub.workspaceId, { status: "CANCELED", canceledAt: new Date() })
        logger.info({ workspaceId: sub.workspaceId }, "[billing] subscription cancelled")
      }
      await notifyOwner(sub.workspaceId, (c) => emailService.sendSubscriptionCanceled({
        to: c.email, name: c.name, planName: planLabel(sub.plan), accessUntil: keepUntil,
      }))
      break
    }
    case "pending":
    default:
      // Awaiting first authorization — no access change.
      break
  }
}

async function applyPayment(provider: BillingGatewayProvider, sub: Subscription, remote: GatewayPayment): Promise<void> {
  const description = `Assinatura Vincel Studio — ${sub.plan}`

  if (remote.status === "approved") {
    // Pre-event status distinguishes the very first payment (activation) from a
    // recurring charge (renewal) — drives which email goes out.
    const wasActive = sub.status === "ACTIVE"

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
    let nextBilling: Date | null = null
    if (sub.mpSubscriptionId) {
      const remoteSub = await provider.getSubscription(sub.mpSubscriptionId).catch(() => null)
      if (remoteSub?.nextPaymentDate) {
        nextBilling = remoteSub.nextPaymentDate
        await subscriptionRepository.update(sub.workspaceId, { currentPeriodEnd: remoteSub.nextPaymentDate })
      }
    }
    logger.info({ workspaceId: sub.workspaceId, mpPaymentId: remote.providerPaymentId, renewal: wasActive }, "[billing] payment approved")
    await notifyOwner(sub.workspaceId, (c) => wasActive
      ? emailService.sendSubscriptionRenewed({ to: c.email, name: c.name, planName: planLabel(sub.plan), amount: remote.amount, nextBilling, receiptUrl: remote.receiptUrl })
      : emailService.sendPaymentApproved({ to: c.email, name: c.name, planName: planLabel(sub.plan), amount: remote.amount, receiptUrl: remote.receiptUrl }))
    return
  }

  if (remote.status === "rejected") {
    await billingService.recordInvoice({
      subscriptionId: sub.id, amount: remote.amount, currency: remote.currency,
      status: "failed", description, mpPaymentId: remote.providerPaymentId, rawPayload: JSON.stringify(remote.raw),
    })
    await subscriptionRepository.update(sub.workspaceId, { status: "PAST_DUE" })
    logger.info({ workspaceId: sub.workspaceId }, "[billing] payment rejected → PAST_DUE")
    await notifyOwner(sub.workspaceId, (c) => emailService.sendPaymentRejected({
      to: c.email, name: c.name, planName: planLabel(sub.plan),
    }))
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

// ─── AI Credit Purchase (resumed sprint) ───────────────────────────────────

// Deliberately does NOT go through billingService.recordPaymentEvent
// (PaymentEvent.subscriptionId is required — this payment has no
// subscription). Idempotency instead comes from two layers, per the approved
// sprint plan: (1) AiCreditPurchase.status only ever transitions out of
// CREATED/PENDING once (markApproved's conditional updateMany), and (2)
// aiCreditService.purchaseCredits' own ledger idempotencyKey @unique — the
// layer that actually guarantees "N webhook deliveries, credits granted
// exactly once", even if this function runs concurrently or is retried.
async function processCreditPurchasePayment(purchaseId: string, remote: GatewayPayment): Promise<void> {
  const purchase = await aiCreditPurchaseRepository.findById(purchaseId)
  if (!purchase) {
    logger.warn({ purchaseId }, "[billing] credit purchase webhook for unknown purchase — acked, not processed")
    return
  }

  if (remote.status === "approved") {
    // Security: credits/workspace ALWAYS come from the purchase row (set at
    // checkout time from config/aiCreditPackages.ts), never from the gateway
    // payload or a frontend value. amount/currency from the gateway are only
    // compared against the purchase's own immutable snapshot as a fraud/
    // misconfiguration backstop — a real mismatch should never happen and is
    // left for manual investigation rather than guessed at automatically.
    if (remote.amount !== purchase.amount || remote.currency !== purchase.currency) {
      logger.error(
        { purchaseId, expected: { amount: purchase.amount, currency: purchase.currency }, received: { amount: remote.amount, currency: remote.currency } },
        "[billing] credit purchase amount/currency mismatch — refusing to grant credits",
      )
      return
    }

    const { alreadyApproved } = await aiCreditPurchaseRepository.markApproved(purchase.id, remote.providerPaymentId)
    await aiCreditService.purchaseCredits(purchase.workspaceId, purchase.credits, purchase.idempotencyKey)

    logger.info(
      { purchaseId, workspaceId: purchase.workspaceId, credits: purchase.credits, duplicate: alreadyApproved },
      alreadyApproved ? "[billing] duplicate credit purchase webhook — credits already granted, no-op" : "[billing] credit purchase approved — credits granted",
    )
    return
  }

  if (remote.status === "rejected") {
    await aiCreditPurchaseRepository.markRejected(purchase.id, remote.providerPaymentId)
    logger.info({ purchaseId }, "[billing] credit purchase rejected")
    return
  }

  if (remote.status === "cancelled") {
    await aiCreditPurchaseRepository.markCancelled(purchase.id)
    logger.info({ purchaseId }, "[billing] credit purchase cancelled")
    return
  }

  if (remote.status === "refunded" || remote.status === "charged_back") {
    // Out of scope for this sprint (documented pendency) — purchased credits
    // are not auto-reversed; logged for manual follow-up.
    logger.warn({ purchaseId, status: remote.status }, "[billing] credit purchase refunded/charged_back — credits NOT reversed (out of scope this sprint)")
    return
  }

  // pending: nothing actionable yet, awaiting a future approved/rejected event.
}
