import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { aiRateLimit } from "@/middlewares/rateLimiter"
import { proposalSectionInstanceService } from "@/services/proposal-section-instance.service"
import { ok, internalError, badRequest } from "@/lib/response"
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
    const updated = await proposalSectionInstanceService.regenerateSection(sectionInstanceId, id, workspaceId)
    return ok(updated, "Section regenerated")
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("VALIDATION:")) {
      return badRequest(error.message.slice("VALIDATION:".length))
    }
    logger.error({ err: error }, "[regenerate-section] failed")
    if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
      return internalError("AI service is not configured")
    }
    return handleServiceError(error)
  }
})
