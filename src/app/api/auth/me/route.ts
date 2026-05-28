import { type NextRequest } from "next/server";
import { withAuth } from "@/middlewares/auth";
import { authService } from "@/services/auth.service";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

export const GET = withAuth(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const me = await authService.me(user.sub);
    return ok(me);
  } catch (error) {
    return handleServiceError(error);
  }
});
