import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { statusService } from "@/services/status.service"
import { updateStatusSchema, getAllowedTransitions, STATUS_LABELS } from "@/validations/status"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"
import type { ProposalStatus } from "@prisma/client"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id }  = await ctx.params
    const body    = await req.json()
    const input   = updateStatusSchema.parse(body)

    const result = await statusService.update(id, user.sub, input)

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

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params
    const { proposalRepository } = await import("@/repositories/proposal.repository")

    const proposal = await proposalRepository.findById(id, user.sub)
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
