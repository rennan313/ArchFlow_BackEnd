import { logger } from "@/lib/logger"
import { AppError, ErrorCode } from "@/lib/errors"
import { subscriptionService } from "@/services/subscription.service"
import { getBillingProvider } from "../providers"
import type { Subscription } from "@prisma/client"

// Cancel/reactivate orchestration that spans the gateway + the local
// Subscription. Kept in the billing module (not subscription.service) because
// it talks to a provider — subscription.service stays gateway-agnostic.
export const billingSubscriptionService = {
  /**
   * Cancel: stop future charges at the gateway NOW (Mercado Pago has no
   * "cancel at period end" — cancelling the preapproval halts renewal), but
   * KEEP local access until currentPeriodEnd by only recording the intent
   * (cancelAtPeriodEnd). The subsequent "cancelled" webhook is handled to
   * respect that intent (see billingWebhook.service applySubscription), so the
   * user isn't locked out of a period they already paid for.
   */
  async cancel(workspaceId: string): Promise<Subscription> {
    const sub = await subscriptionService.getActiveSubscription(workspaceId)
    if (!sub) throw new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND)

    const provider = getBillingProvider()
    if (sub.mpSubscriptionId && provider.configured) {
      await provider.cancelSubscription(sub.mpSubscriptionId).catch((err) =>
        // Don't fail the user's cancel if MP is momentarily down — the local
        // intent is recorded and a reconciliation pass can re-issue it.
        logger.error({ workspaceId, err: String(err) }, "[billing] gateway cancel failed — local intent still recorded"),
      )
    }
    return subscriptionService.cancelSubscription(workspaceId)
  },

  /**
   * Reactivate: undo a pending cancellation (clears cancelAtPeriodEnd). A
   * subscription already fully CANCELED/EXPIRED at the gateway needs a fresh
   * checkout instead — the frontend routes there when status isn't ACTIVE.
   */
  async reactivate(workspaceId: string): Promise<Subscription> {
    const sub = await subscriptionService.getActiveSubscription(workspaceId)
    if (!sub) throw new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND)
    return subscriptionService.reactivateSubscription(workspaceId)
  },
}
