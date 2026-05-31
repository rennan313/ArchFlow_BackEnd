import { type NextRequest } from "next/server"
import { verifyAccessToken } from "@/lib/jwt"
import { unauthorized } from "@/lib/response"
import type { JwtPayload } from "@/lib/jwt"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = { params: Promise<any> }

/** The 3-argument inner handler that receives the verified user.
 *  Uses Promise<any> for params so route files can narrow to their own
 *  specific param shapes (e.g. { id: string }) without invariance conflicts. */
export interface WithAuthHandler {
  (req: NextRequest, context: AnyCtx, user: JwtPayload): Promise<Response>
}

/** The 2-argument Next.js App Router route handler returned by withAuth(). */
export type RouteHandler = (req: NextRequest, context: AnyCtx) => Promise<Response>

export function withAuth(handler: WithAuthHandler): RouteHandler {
  return async (req: NextRequest, context: AnyCtx): Promise<Response> => {
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return unauthorized("Missing or invalid authorization header")
    }

    const token = authHeader.slice(7)
    try {
      const user = verifyAccessToken(token)
      return handler(req, context, user)
    } catch {
      return unauthorized("Invalid or expired token")
    }
  }
}

export function withAdminAuth(handler: WithAuthHandler): RouteHandler {
  return withAuth(async (req, context, user) => {
    if (user.role !== "ADMIN") {
      const { forbidden } = await import("@/lib/response")
      return forbidden("Admin access required")
    }
    return handler(req, context, user)
  })
}
