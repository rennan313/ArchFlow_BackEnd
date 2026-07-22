import { prisma } from "@/lib/prisma"
import type { AiCreditPurchase } from "@prisma/client"

// AI Credit Purchase sprint (resumed) — persistence for the one-off gateway
// purchase lifecycle (CREATED → PENDING → APPROVED/REJECTED/CANCELLED/
// EXPIRED). Deliberately thin: the transactional "approve exactly once, then
// grant credits" logic lives in aiCreditPurchase.service.ts /
// billingWebhookService, not here — this file only does reads/writes on a
// single AiCreditPurchase row.

export interface CreatePurchaseInput {
  workspaceId:       string
  userId:            string
  packageId:         string
  credits:           number
  amount:            number
  currency:          string
  gateway:           string
  // Temporary, unique-but-not-yet-derived values — the real
  // "AI_CREDIT_PURCHASE:<id>" / "ai-credit-purchase:<id>" strings need the
  // row's own generated id, so createPurchase creates first with placeholders
  // then calls finalizeReferences() (see aiCreditPurchase.service.ts).
  externalReference: string
  idempotencyKey:    string
}

export const aiCreditPurchaseRepository = {
  create(input: CreatePurchaseInput): Promise<AiCreditPurchase> {
    return prisma.aiCreditPurchase.create({ data: { ...input, status: "CREATED" } })
  },

  finalizeReferences(id: string, externalReference: string, idempotencyKey: string): Promise<AiCreditPurchase> {
    return prisma.aiCreditPurchase.update({ where: { id }, data: { externalReference, idempotencyKey } })
  },

  findById(id: string): Promise<AiCreditPurchase | null> {
    return prisma.aiCreditPurchase.findUnique({ where: { id } })
  },

  findByExternalReference(externalReference: string): Promise<AiCreditPurchase | null> {
    return prisma.aiCreditPurchase.findUnique({ where: { externalReference } })
  },

  async setGatewayPreference(id: string, gatewayPaymentId: string | null): Promise<void> {
    await prisma.aiCreditPurchase.update({ where: { id }, data: { status: "PENDING", gatewayPaymentId } })
  },

  /** CAS: only transitions a row that's still awaiting a terminal outcome —
   *  the actual double-processing guard is aiCreditService.purchaseCredits'
   *  ledger idempotencyKey, but this update being conditional (count 0 on a
   *  retry) keeps the purchase row from re-running its own side effects. */
  async markApproved(id: string, gatewayPaymentId: string): Promise<{ alreadyApproved: boolean }> {
    const result = await prisma.aiCreditPurchase.updateMany({
      where: { id, status: { in: ["CREATED", "PENDING"] } },
      data:  { status: "APPROVED", gatewayPaymentId, approvedAt: new Date() },
    })
    return { alreadyApproved: result.count === 0 }
  },

  async markRejected(id: string, gatewayPaymentId: string): Promise<void> {
    await prisma.aiCreditPurchase.updateMany({
      where: { id, status: { in: ["CREATED", "PENDING"] } },
      data:  { status: "REJECTED", gatewayPaymentId },
    })
  },

  async markCancelled(id: string): Promise<void> {
    await prisma.aiCreditPurchase.updateMany({
      where: { id, status: { in: ["CREATED", "PENDING"] } },
      data:  { status: "CANCELLED" },
    })
  },

  listByWorkspace(workspaceId: string, limit = 20): Promise<AiCreditPurchase[]> {
    return prisma.aiCreditPurchase.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: "desc" },
      take:    limit,
    })
  },
}
