import { paymentEventRepository } from "@/repositories/paymentEvent.repository"
import { billingHistoryRepository } from "@/repositories/billingHistory.repository"
import { subscriptionRepository } from "@/repositories/subscription.repository"
import { AppError, ErrorCode } from "@/lib/errors"
import type { PaymentEvent, BillingHistory } from "@prisma/client"

export interface RecordPaymentEventInput {
  subscriptionId: string
  provider:       string
  externalId:     string
  type:           string
  rawPayload:     string
}

export interface RecordInvoiceInput {
  subscriptionId: string
  amount:         number
  currency?:      string
  status:         string
  description:    string
  paidAt?:        Date
  mpPaymentId?:   string
}

export const billingService = {
  /**
   * Idempotent by design: webhook delivery is at-least-once, so the same
   * externalId can arrive more than once (retry, duplicate delivery, races).
   * If it's already been recorded, return the existing row instead of
   * inserting a duplicate or throwing — the caller (Phase 2 webhook handler)
   * can treat this exactly like a fresh event and re-run its own logic
   * idempotently on top, or skip if `processedAt` is already set.
   */
  async recordPaymentEvent(input: RecordPaymentEventInput): Promise<PaymentEvent> {
    const existing = await paymentEventRepository.findByExternalId(input.externalId)
    if (existing) return existing

    return paymentEventRepository.create({
      subscriptionId: input.subscriptionId,
      provider:       input.provider,
      externalId:     input.externalId,
      type:           input.type,
      rawPayload:     input.rawPayload,
      status:         "received",
    })
  },

  async markEventProcessed(eventId: string, status: "processed" | "failed" = "processed"): Promise<PaymentEvent> {
    return paymentEventRepository.markProcessed(eventId, status)
  },

  async getEventsForWorkspace(workspaceId: string): Promise<PaymentEvent[]> {
    const subscription = await subscriptionRepository.findByWorkspace(workspaceId)
    if (!subscription) throw new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND)
    return paymentEventRepository.findBySubscription(subscription.id)
  },

  /**
   * Idempotent on mpPaymentId when present: re-recording the same gateway
   * payment (e.g. a webhook retry that already produced an invoice line)
   * returns the existing row instead of creating a second BillingHistory
   * entry for money that was only actually charged once.
   */
  async recordInvoice(input: RecordInvoiceInput): Promise<BillingHistory> {
    if (input.mpPaymentId) {
      const existing = await billingHistoryRepository.findByMpPaymentId(input.mpPaymentId)
      if (existing) return existing
    }

    return billingHistoryRepository.create({
      subscriptionId: input.subscriptionId,
      amount:         input.amount,
      currency:       input.currency ?? "BRL",
      status:         input.status,
      description:    input.description,
      paidAt:         input.paidAt,
      mpPaymentId:    input.mpPaymentId,
    })
  },

  async getHistory(workspaceId: string): Promise<BillingHistory[]> {
    const subscription = await subscriptionRepository.findByWorkspace(workspaceId)
    if (!subscription) throw new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND)
    return billingHistoryRepository.findBySubscription(subscription.id)
  },
}
