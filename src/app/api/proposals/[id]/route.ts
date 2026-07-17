import { type NextRequest } from "next/server";
import { withWorkspace } from "@/middlewares/auth";
import { requireWorkspacePermission } from "@/middlewares/rbac";
import { proposalService } from "@/services/proposal.service";
import { updateProposalSchema } from "@/validations/proposal";
import { ok, noContent } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

type Ctx = { params: Promise<Record<string, string>> };

export const GET = withWorkspace(async (_req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params;
    const proposal = await proposalService.getById(id, workspaceId);
    return ok(proposal);
  } catch (error) {
    return handleServiceError(error);
  }
});

export const PUT = requireWorkspacePermission("update:proposals")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const input = updateProposalSchema.parse(body);
    const proposal = await proposalService.update(id, workspaceId, input);
    return ok(proposal, "Proposal updated successfully");
  } catch (error) {
    return handleServiceError(error);
  }
});

export const DELETE = requireWorkspacePermission("delete:proposals")(async (_req: NextRequest, ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params;
    await proposalService.delete(id, workspaceId, user.sub);
    return noContent();
  } catch (error) {
    return handleServiceError(error);
  }
});
