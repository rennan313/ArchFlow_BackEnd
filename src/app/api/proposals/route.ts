import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { requireProposalLimit } from "@/middlewares/limits"
import { proposalService } from "@/services/proposal.service"
import { createProposalSchema, proposalQuerySchema } from "@/validations/proposal"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const query = proposalQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const { data, pagination } = await proposalService.list(user.sub, query)
    return ok(data, undefined, pagination)
  } catch (error) {
    return handleServiceError(error)
  }
})

export const POST = requireProposalLimit(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const body     = await req.json()
    const input    = createProposalSchema.parse(body)
    const proposal = await proposalService.create(user.sub, input)
    return created(proposal, "Proposal created successfully")
  } catch (error) {
    return handleServiceError(error)
  }
})
