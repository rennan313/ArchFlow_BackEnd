import { type NextRequest } from "next/server"
import { verifyAccessToken } from "@/lib/jwt"
import { unauthorized, forbidden } from "@/lib/response"
import type { JwtPayload } from "@/lib/jwt"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = { params: Promise<any> }

/** The 3-argument inner handler that receives the verified user.
 *  Uses Promise<any> for params so route files can narrow to their own
 *  specific param shapes (e.g. { id: string }) without invariance conflicts. */
export interface WithAuthHandler {
  (req: NextRequest, context: AnyCtx, user: JwtPayload): Promise<Response>
}

/** The 4-argument inner handler used by domain routes — receives the
 *  verified, non-null workspaceId alongside the user, so call sites never
 *  have to re-check `user.workspaceId` themselves. */
export interface WithWorkspaceHandler {
  (req: NextRequest, context: AnyCtx, user: JwtPayload, workspaceId: string): Promise<Response>
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
      return forbidden("Admin access required")
    }
    return handler(req, context, user)
  })
}

/** All domain-data routes (clients, projects, opportunities, proposals,
 *  meetings, branding, dashboard) must use this instead of withAuth —
 *  it guarantees a non-null workspaceId reaches the handler, closing the
 *  case where a user mid-onboarding (or a pre-migration legacy account)
 *  has no workspace yet and would otherwise hit domain queries with a
 *  null tenant scope. */
export function withWorkspace(handler: WithWorkspaceHandler): RouteHandler {
  return withAuth(async (req, context, user) => {
    if (!user.workspaceId) {
      return forbidden("This action requires a workspace. Complete onboarding first.")
    }
    return handler(req, context, user, user.workspaceId)
  })
}
