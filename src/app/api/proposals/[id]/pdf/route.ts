import { type NextRequest, NextResponse } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { proposalRendererService } from "@/services/render/proposal-renderer.service"
import { limitService } from "@/services/billing/limit.service"
import { RenderError } from "@/types/proposal-render-model"
import { handleServiceError } from "@/utils/serviceError"
import { forbidden } from "@/lib/response"
import { logger } from "@/lib/logger"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Fase 2.0 — this route no longer reads generatedProposalJson directly.
// ProposalRendererService is the single source of truth: it loads
// ProposalSectionInstance rows (migrating legacy generatedProposalJson into
// instances on first access if none exist yet — see legacy-migration.service.ts),
// maps them through ProposalRenderModel, and only then renders. Whatever the
// Editor shows is exactly what this route exports — there is no second copy
// of the content anywhere in this path.
export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params

    // Entitlements Sprint Phase 3 — PDF_EXPORT was never gated by plan
    // before (audited: `withWorkspace` only, no feature check at all).
    // Shadow-mode by default (BILLING_ENFORCEMENT_DEFAULT=false) — this is
    // net-new enforcement, so it can only ever ADD a restriction, never
    // regress something that was already blocking, unlike seat/proposal/
    // storage checks (left untouched in this phase — see plan notes).
    const featureCheck = await limitService.canUseFeature(workspaceId, "PDF_EXPORT")
    if (!featureCheck.allowed) return forbidden(featureCheck.reason ?? "PDF export is not available on your plan")

    const { buffer, doc } = await proposalRendererService.renderToPdf(id, workspaceId)

    const filename = `proposta-${doc.cover.clientName.toLowerCase().replace(/\s+/g, "-")}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length":      buffer.length.toString(),
        "Cache-Control":       "no-store",
      },
    })
  } catch (error) {
    if (error instanceof RenderError) {
      const status = error.code === "PROPOSAL_NOT_FOUND" ? 404 : 422
      return NextResponse.json({ success: false, message: error.message, code: error.code }, { status })
    }
    logger.error({ err: error }, "[pdf] generation failed")
    return handleServiceError(error)
  }
})
