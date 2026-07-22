import { randomUUID } from "node:crypto"
import { AppError, ErrorCode } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { aiCreditPurchaseRepository } from "@/repositories/aiCreditPurchase.repository"
import { CREDIT_PACKAGES, isCreditPackageId, listCreditPackages } from "@/config/aiCreditPackages"
import { getBillingProvider } from "@/modules/billing/providers"
import { prisma } from "@/lib/prisma"
import type { AiCreditPurchase } from "@prisma/client"

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

export interface CreateCreditCheckoutInput {
  workspaceId: string
  userId:      string
  packageId:   string
  backUrl:     string
}

export interface CreateCreditCheckoutResult {
  initPoint: string
  purchaseId: string
}

// AI Credit Purchase sprint (resumed) — the credits-purchase counterpart of
// billingCheckoutService.createCheckout, but for a one-off gateway payment
// instead of a recurring preapproval. Never confuse the two: this never
// calls provider.createSubscription, and every AiCreditPurchase gets its own
// externalReference namespaced "AI_CREDIT_PURCHASE:" so
// billingWebhookService can route a payment webhook to the right domain
// without ever inferring it from amount/credits/plan.
export const aiCreditPurchaseService = {
  listPackages() {
    return listCreditPackages()
  },

  async createCheckout(input: CreateCreditCheckoutInput): Promise<CreateCreditCheckoutResult> {
    if (!isCreditPackageId(input.packageId)) throw new AppError(ErrorCode.AI_CREDIT_PACKAGE_NOT_FOUND)
    const pkg = CREDIT_PACKAGES[input.packageId]

    // FROZEN blocks at creation — gated here explicitly (not via the generic
    // canWrite/withWorkspace gate, which also blocks EXPIRED/PAST_DUE/
    // CANCELED/PAUSED; the spec only calls out FROZEN for credit purchases).
    const sub = await subscriptionRepository.findByWorkspace(input.workspaceId)
    if (sub?.status === "FROZEN") throw new AppError(ErrorCode.WORKSPACE_FROZEN)

    const provider = getBillingProvider()
    if (!provider.configured) throw new AppError(ErrorCode.BILLING_NOT_CONFIGURED)

    // Two-phase create: the row's own id feeds the externalReference/
    // idempotencyKey it needs, so it's created first with unique-but-
    // temporary placeholders, then finalized once the real id exists.
    const placeholder = `pending:${randomUUID()}`
    const created = await aiCreditPurchaseRepository.create({
      workspaceId: input.workspaceId,
      userId:      input.userId,
      packageId:   pkg.id,
      credits:     pkg.credits, // snapshot — a later reprice never changes this row
      amount:      pkg.price,
      currency:    pkg.currency,
      gateway:     "mercadopago",
      externalReference: placeholder,
      idempotencyKey:    placeholder,
    })

    const externalReference = `AI_CREDIT_PURCHASE:${created.id}`
    const idempotencyKey     = `ai-credit-purchase:${created.id}`
    const purchase = await aiCreditPurchaseRepository.finalizeReferences(created.id, externalReference, idempotencyKey)

    const payerEmail = await resolveOwnerEmail(input.workspaceId)
    // Purchase id appended to the return URL so the frontend can poll this
    // purchase's real status on return — never a substitute for the webhook
    // (the query string is just "which purchase to poll", the gateway's own
    // redirect-time status params are never trusted as payment confirmation).
    const returnUrl = `${input.backUrl}${input.backUrl.includes("?") ? "&" : "?"}purchase=${purchase.id}`
    const intent = await provider.createOneOffPayment({
      description:       `Vincel Studio — ${pkg.credits} créditos de IA`,
      amount:             pkg.price,
      currency:           pkg.currency,
      payerEmail,
      externalReference,
      backUrl:            returnUrl,
    })
    if (!intent.initPoint) throw new AppError(ErrorCode.BILLING_PROVIDER_ERROR, "Gateway returned no checkout URL")

    await aiCreditPurchaseRepository.setGatewayPreference(purchase.id, intent.providerPreferenceId)

    logger.info({ workspaceId: input.workspaceId, purchaseId: purchase.id, packageId: pkg.id }, "[billing] credit purchase checkout created")

    return { initPoint: intent.initPoint, purchaseId: purchase.id }
  },

  // Scoped by workspaceId — never returns (or leaks the existence of) a
  // purchase belonging to another workspace, same cross-tenant convention as
  // proposalService.getById.
  async getById(id: string, workspaceId: string): Promise<AiCreditPurchase> {
    const purchase = await aiCreditPurchaseRepository.findById(id)
    if (!purchase || purchase.workspaceId !== workspaceId) throw new AppError(ErrorCode.AI_CREDIT_PURCHASE_NOT_FOUND)
    return purchase
  },

  listHistory(workspaceId: string): Promise<AiCreditPurchase[]> {
    return aiCreditPurchaseRepository.listByWorkspace(workspaceId)
  },
}
