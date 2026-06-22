import { type NextRequest } from "next/server"
import { verifyAccessToken } from "@/lib/jwt"
import { unauthorized, forbidden } from "@/lib/response"
import { subscriptionService } from "@/services/subscription.service"
import type { JwtPayload } from "@/lib/jwt"

/** GET/HEAD/OPTIONS are always allowed regardless of subscription status —
 *  login and viewing must keep working even on a read-only workspace. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

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
    // No free tier — a workspace whose trial has lapsed (or whose
    // subscription is EXPIRED/CANCELED/PAST_DUE) keeps read access but loses
    // every write. Checked here, not per-route, because withWorkspace is the
    // one chokepoint every domain route already goes through (directly or
    // via rbac.ts/limits.ts) — no new route can forget this the way the
    // cross-tenant reference guard once was opt-in per service.
    if (!READ_METHODS.has(req.method)) {
      const canWrite = await subscriptionService.canWrite(user.workspaceId)
      if (!canWrite) return forbidden("Seu período de avaliação terminou.")
    }
    return handler(req, context, user, user.workspaceId)
  })
}

/** Identical to withWorkspace but skips the trial/subscription write-gate —
 *  used exclusively by the billing upgrade route (requireWorkspaceRoleNoBillingGate
 *  in rbac.ts), so the OWNER can still pay and unlock the workspace while it's
 *  read-only. Do not reuse this for any other route. */
export function withWorkspaceNoBillingGate(handler: WithWorkspaceHandler): RouteHandler {
  return withAuth(async (req, context, user) => {
    if (!user.workspaceId) {
      return forbidden("This action requires a workspace. Complete onboarding first.")
    }
    return handler(req, context, user, user.workspaceId)
  })
}
