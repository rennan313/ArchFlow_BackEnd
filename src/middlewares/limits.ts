import type { NextRequest } from "next/server"
import { withWorkspace, type WithWorkspaceHandler, type RouteHandler } from "./auth"
import { subscriptionService } from "@/services/subscription.service"
import { forbidden } from "@/lib/response"
import type { JwtPayload } from "@/lib/jwt"

function limitExceeded(result: Awaited<ReturnType<typeof subscriptionService.canAddUser>>) {
  return forbidden(result.reason ?? "Plan limit reached")
}

// ─── Limit guards ─────────────────────────────────────────────────────────────
//
// All built on withWorkspace (not withAuth) — this is what makes the
// trial/subscription write-gate in withWorkspace run before the plan-limit
// check below. Previously these wrapped withAuth directly so each route
// could run its own workspace check first; that meant a request with an
// expired trial could still reach canCreateProposal()/canAddUser() and
// succeed, bypassing the read-only lock entirely (confirmed live against
// POST /api/proposals before this fix — trial expired, request still
// returned 201). Routing through withWorkspace closes that gap the same way
// every other domain route is already closed, with no new logic to keep
// in sync.

export function requireProposalLimit(handler: WithWorkspaceHandler): RouteHandler {
  return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
    const check = await subscriptionService.canCreateProposal(workspaceId)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user, workspaceId)
  })
}

export function requireUserLimit(handler: WithWorkspaceHandler): RouteHandler {
  return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
    const check = await subscriptionService.canAddUser(workspaceId)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user, workspaceId)
  })
}

export function requireStorageLimit(fileSizeMb: number) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const check = await subscriptionService.canUploadFile(workspaceId, fileSizeMb)
      if (!check.allowed) return limitExceeded(check)
      return handler(req, ctx, user, workspaceId)
    })
  }
}

export function requireFeature(feature: "canCustomBranding" | "canExportPdf" | "canApiAccess") {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const check = await subscriptionService.canUseFeature(workspaceId, feature)
      if (!check.allowed) return limitExceeded(check)
      return handler(req, ctx, user, workspaceId)
    })
  }
}

// ─── Dynamic upload limit (reads file size from FormData) ─────────────────────

export function requireDynamicStorageLimit(handler: WithWorkspaceHandler): RouteHandler {
  return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
    const clone    = req.clone()
    const formData = await clone.formData().catch(() => null)
    const file     = formData?.get("file")
    const sizeMb   = file instanceof File ? file.size / (1024 * 1024) : 0

    const check = await subscriptionService.canUploadFile(workspaceId, sizeMb)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user, workspaceId)
  })
}
