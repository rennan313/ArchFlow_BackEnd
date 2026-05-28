import { type NextRequest } from "next/server";
import { withAuth } from "@/middlewares/auth";
import { instanceService } from "@/services/instance.service";
import { instanceQuerySchema } from "@/validations/instance";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

export const GET = withAuth(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload) => {
  try {
    const query = instanceQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const { data, pagination } = await instanceService.list(query);
    return ok(data, undefined, pagination);
  } catch (error) {
    return handleServiceError(error);
  }
});
