import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { proposalSectionInstanceService } from "@/services/proposal-section-instance.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

// Idempotent — calling this again on an already-initialized proposal returns
// the existing builder view instead of re-running the advisor or duplicating
// section instances (see proposal-section-instance.service.ts#initialize).
export const POST = requireWorkspacePermission("update:proposals")(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    return ok(await proposalSectionInstanceService.initialize(id, workspaceId), "Proposal editing started")
  } catch (error) { return handleServiceError(error) }
})
