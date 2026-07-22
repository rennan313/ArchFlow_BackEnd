import { type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { aiRateLimit } from "@/middlewares/rateLimiter"
import { proposalSectionInstanceService } from "@/services/proposal-section-instance.service"
import { aiCreditService } from "@/services/billing/aiCredit.service"
import { ok, internalError, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string; sectionInstanceId: string }> }

export const maxDuration = 60

// Fase B — regenerate ONE premium-narrative section's AI content in place.
// Same AI rate limit as full generation: a regeneration is a Haiku call.
export const POST = requireWorkspacePermission("update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  const limited = await aiRateLimit(req)
  if (limited) return limited

  try {
    const { id, sectionInstanceId } = await ctx.params

    // Entitlements Sprint "close the debts" (2026-07) — this is the
    // blueprint's "revisao" cost tier (1 credit — the cheapest operation,
    // it edits an existing section rather than generating a whole
    // proposal/narrative from scratch). Same debit-before-call,
    // refund-on-failure shape as the other AI routes.
    const aiDebitKey = `ai-debit:regenerate-section:${randomUUID()}`
    const debit = await aiCreditService.debit({ workspaceId, operation: "revisao", idempotencyKey: aiDebitKey, relatedEntityId: sectionInstanceId })
    if (!debit.allowed) return forbidden(debit.reason ?? "AI credits exhausted")

    let updated
    try {
      updated = await proposalSectionInstanceService.regenerateSection(sectionInstanceId, id, workspaceId)
    } catch (genError) {
      await aiCreditService.refund(workspaceId, debit.ledgerEntryIds, "generation_failed")
      throw genError
    }

    return ok(updated, "Section regenerated")
  } catch (error) {
    logger.error({ err: error }, "[regenerate-section] failed")
    if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
      return internalError("AI service is not configured")
    }
    return handleServiceError(error)
  }
})
