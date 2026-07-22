import type { NextRequest } from "next/server"
import { withWorkspace, type WithWorkspaceHandler, type RouteHandler } from "./auth"
import { limitService } from "@/services/billing/limit.service"
import { forbidden } from "@/lib/response"
import type { JwtPayload } from "@/lib/jwt"
import type { FeatureKey } from "@prisma/client"

function limitExceeded(result: Awaited<ReturnType<typeof limitService.canAddSeat>>) {
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
//
// Entitlements Sprint (2026-07) — repointed from subscriptionService (stale
// config/plans.ts numbers) to limitService (live BillingPlan). Seat/
// proposal/storage checks below are legacy-parity — limitService enforces
// them for real, never shadow-gated (see limit.service.ts's withShadowMode
// comment). requireFeature is the one genuinely NEW gate here — it inherits
// limitService.canUseFeature's shadow-mode behavior automatically.

export function requireProposalLimit(handler: WithWorkspaceHandler): RouteHandler {
  return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
    const check = await limitService.canCreateProposal(workspaceId)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user, workspaceId)
  })
}

export function requireUserLimit(handler: WithWorkspaceHandler): RouteHandler {
  return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
    const check = await limitService.canAddSeat(workspaceId)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user, workspaceId)
  })
}

export function requireStorageLimit(fileSizeMb: number) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const check = await limitService.canUploadFile(workspaceId, fileSizeMb * 1024 * 1024)
      if (!check.allowed) return limitExceeded(check)
      return handler(req, ctx, user, workspaceId)
    })
  }
}

export function requireFeature(feature: FeatureKey) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const check = await limitService.canUseFeature(workspaceId, feature)
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
    const sizeBytes = file instanceof File ? file.size : 0

    const check = await limitService.canUploadFile(workspaceId, sizeBytes)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user, workspaceId)
  })
}
