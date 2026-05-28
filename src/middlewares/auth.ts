import { type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/jwt";
import { unauthorized } from "@/lib/response";
import type { JwtPayload } from "@/lib/jwt";

export interface WithAuthHandler {
  (req: NextRequest, context: { params: Promise<Record<string, string>> }, user: JwtPayload): Promise<Response>;
}

export function withAuth(handler: WithAuthHandler) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return unauthorized("Missing or invalid authorization header");
    }

    const token = authHeader.slice(7);
    try {
      const user = verifyAccessToken(token);
      return handler(req, context, user);
    } catch {
      return unauthorized("Invalid or expired token");
    }
  };
}

export function withAdminAuth(handler: WithAuthHandler) {
  return withAuth(async (req, context, user) => {
    if (user.role !== "ADMIN") {
      const { forbidden } = await import("@/lib/response");
      return forbidden("Admin access required");
    }
    return handler(req, context, user);
  });
}
