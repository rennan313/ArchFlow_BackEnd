import { type NextRequest } from "next/server";
import { withAuth } from "@/middlewares/auth";
import { proposalService } from "@/services/proposal.service";
import { updateProposalSchema } from "@/validations/proposal";
import { ok, noContent } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

type Ctx = { params: Promise<Record<string, string>> };

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params;
    const proposal = await proposalService.getById(id, user.sub);
    return ok(proposal);
  } catch (error) {
    return handleServiceError(error);
  }
});

export const PUT = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const input = updateProposalSchema.parse(body);
    const proposal = await proposalService.update(id, user.sub, input);
    return ok(proposal, "Proposal updated successfully");
  } catch (error) {
    return handleServiceError(error);
  }
});

export const DELETE = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params;
    await proposalService.delete(id, user.sub);
    return noContent();
  } catch (error) {
    return handleServiceError(error);
  }
});
