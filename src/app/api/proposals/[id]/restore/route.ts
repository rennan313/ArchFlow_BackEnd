import { type NextRequest } from "next/server";
import { requireWorkspacePermission } from "@/middlewares/rbac";
import { proposalService } from "@/services/proposal.service";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

type Ctx = { params: Promise<Record<string, string>> };

// Same permission as DELETE — restoring is the inverse of the same
// destructive-tier action, not a new capability.
export const POST = requireWorkspacePermission("delete:proposals")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params;
    const proposal = await proposalService.restore(id, workspaceId, user.sub);
    return ok(proposal, "Proposal restored");
  } catch (error) {
    return handleServiceError(error);
  }
});
