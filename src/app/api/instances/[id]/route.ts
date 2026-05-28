import { type NextRequest } from "next/server";
import { withAuth } from "@/middlewares/auth";
import { instanceService } from "@/services/instance.service";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

type Context = { params: Promise<Record<string, string>> };

export const GET = withAuth(async (_req: NextRequest, ctx: Context, _user: JwtPayload) => {
  try {
    const { id } = await ctx.params;
    const instance = await instanceService.getById(id);
    return ok(instance);
  } catch (error) {
    return handleServiceError(error);
  }
});
