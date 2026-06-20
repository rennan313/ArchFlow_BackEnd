import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission, hasPermission } from "@/middlewares/rbac"
import { statusService } from "@/services/status.service"
import { updateStatusSchema, getAllowedTransitions, STATUS_LABELS } from "@/validations/status"
import { ok, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"
import type { ProposalStatus } from "@prisma/client"

type Ctx = { params: Promise<{ id: string }> }

// Any status change needs at least update:proposals. Moving specifically to
// APPROVED needs the stronger approve:proposals — ARCHITECT/ADMIN/OWNER only,
// not ASSISTANT (which can edit a proposal but not approve it).
export const PATCH = requireWorkspacePermission("update:proposals")(async (req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id }  = await ctx.params
    const body    = await req.json()
    const input   = updateStatusSchema.parse(body)

    if (input.status === "APPROVED" && !hasPermission(user.workspaceRole ?? "VIEWER", "approve:proposals")) {
      return forbidden("Permission denied: approve:proposals")
    }

    const result = await statusService.update(id, workspaceId, input)

    return ok(
      {
        proposal:          result.proposal,
        changed:           result.changed,
        allowedTransitions: getAllowedTransitions(result.proposal!.status as ProposalStatus)
          .map((s) => ({ status: s, label: STATUS_LABELS[s] })),
      },
      result.message,
    )
  } catch (error) {
    return handleServiceError(error)
  }
})

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const { proposalRepository } = await import("@/repositories/proposal.repository")

    const proposal = await proposalRepository.findById(id, workspaceId)
    if (!proposal) {
      const { notFound } = await import("@/lib/response")
      return notFound()
    }

    const status = proposal.status as ProposalStatus

    return ok({
      current:            { status, label: STATUS_LABELS[status] },
      allowedTransitions: getAllowedTransitions(status).map((s) => ({ status: s, label: STATUS_LABELS[s] })),
      statusUpdatedAt:    (proposal as { statusUpdatedAt?: Date | null }).statusUpdatedAt ?? null,
    })
  } catch (error) {
    return handleServiceError(error)
  }
})
