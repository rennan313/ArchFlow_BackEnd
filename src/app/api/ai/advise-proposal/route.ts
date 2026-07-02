import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { advisorRateLimit } from "@/middlewares/rateLimiter"
import { proposalAdvisorService } from "@/services/ai/proposal-advisor.service"
import { adviseProposalSchema } from "@/validations/ai-proposal-advisor"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// No LLM call here — the advisor is a deterministic rules/scoring engine over
// the workspace's content library (see proposal-advisor.service.ts). It only
// ever recommends template/skin/narrative/sections/blocks that already exist;
// it never writes prose, HTML, or a PDF. Gated the same as proposal creation
// since it's a precursor step in that same workflow.
export const POST = requireWorkspacePermission("create:proposals")(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  const limited = await advisorRateLimit(req)
  if (limited) return limited

  try {
    const input  = adviseProposalSchema.parse(await req.json())
    const advice = await proposalAdvisorService.advise(input.projectId, workspaceId)
    return ok(advice)
  } catch (error) { return handleServiceError(error) }
})
