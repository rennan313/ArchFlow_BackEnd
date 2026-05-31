import type { NextRequest } from "next/server"
import { withAuth, type WithAuthHandler, type RouteHandler } from "./auth"
import { subscriptionService } from "@/services/subscription.service"
import { forbidden } from "@/lib/response"
import type { JwtPayload } from "@/lib/jwt"

function limitExceeded(result: Awaited<ReturnType<typeof subscriptionService.canAddUser>>) {
  return forbidden(result.reason ?? "Plan limit reached")
}

// ─── Limit guards ─────────────────────────────────────────────────────────────

export function requireProposalLimit(handler: WithAuthHandler): RouteHandler {
  return withAuth(async (req: NextRequest, ctx, user: JwtPayload) => {
    if (!user.workspaceId) return handler(req, ctx, user)
    const check = await subscriptionService.canCreateProposal(user.workspaceId)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user)
  })
}

export function requireUserLimit(handler: WithAuthHandler): RouteHandler {
  return withAuth(async (req: NextRequest, ctx, user: JwtPayload) => {
    if (!user.workspaceId) return handler(req, ctx, user)
    const check = await subscriptionService.canAddUser(user.workspaceId)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user)
  })
}

export function requireStorageLimit(fileSizeMb: number) {
  return (handler: WithAuthHandler): RouteHandler => {
    return withAuth(async (req: NextRequest, ctx, user: JwtPayload) => {
      if (!user.workspaceId) return handler(req, ctx, user)
      const check = await subscriptionService.canUploadFile(user.workspaceId, fileSizeMb)
      if (!check.allowed) return limitExceeded(check)
      return handler(req, ctx, user)
    })
  }
}

export function requireFeature(feature: "canCustomBranding" | "canExportPdf" | "canApiAccess") {
  return (handler: WithAuthHandler): RouteHandler => {
    return withAuth(async (req: NextRequest, ctx, user: JwtPayload) => {
      if (!user.workspaceId) return handler(req, ctx, user)
      const check = await subscriptionService.canUseFeature(user.workspaceId, feature)
      if (!check.allowed) return limitExceeded(check)
      return handler(req, ctx, user)
    })
  }
}

// ─── Dynamic upload limit (reads file size from FormData) ─────────────────────

export function requireDynamicStorageLimit(handler: WithAuthHandler): RouteHandler {
  return withAuth(async (req: NextRequest, ctx, user: JwtPayload) => {
    if (!user.workspaceId) return handler(req, ctx, user)

    const clone    = req.clone()
    const formData = await clone.formData().catch(() => null)
    const file     = formData?.get("file")
    const sizeMb   = file instanceof File ? file.size / (1024 * 1024) : 0

    const check = await subscriptionService.canUploadFile(user.workspaceId, sizeMb)
    if (!check.allowed) return limitExceeded(check)
    return handler(req, ctx, user)
  })
}
