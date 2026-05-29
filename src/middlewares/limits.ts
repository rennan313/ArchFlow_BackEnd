import type { NextRequest } from "next/server"
import { withAuth, type WithAuthHandler } from "./auth"
import { subscriptionService } from "@/services/subscription.service"
import { forbidden } from "@/lib/response"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

function limitExceeded(result: Awaited<ReturnType<typeof subscriptionService.canAddUser>>) {
  return forbidden(result.reason ?? "Plan limit reached")
}

// ─── Limit guards ─────────────────────────────────────────────────────────────

export function requireProposalLimit(handler: WithAuthHandler): WithAuthHandler {
  return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
    if (!user.workspaceId) return handler(req, ctx, user)

    const check = await subscriptionService.canCreateProposal(user.workspaceId)
    if (!check.allowed) return limitExceeded(check)

    return handler(req, ctx, user)
  }) as WithAuthHandler
}

export function requireUserLimit(handler: WithAuthHandler): WithAuthHandler {
  return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
    if (!user.workspaceId) return handler(req, ctx, user)

    const check = await subscriptionService.canAddUser(user.workspaceId)
    if (!check.allowed) return limitExceeded(check)

    return handler(req, ctx, user)
  }) as WithAuthHandler
}

export function requireStorageLimit(fileSizeMb: number) {
  return (handler: WithAuthHandler): WithAuthHandler => {
    return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
      if (!user.workspaceId) return handler(req, ctx, user)

      const check = await subscriptionService.canUploadFile(user.workspaceId, fileSizeMb)
      if (!check.allowed) return limitExceeded(check)

      return handler(req, ctx, user)
    }) as WithAuthHandler
  }
}

export function requireFeature(feature: "canCustomBranding" | "canExportPdf" | "canApiAccess") {
  return (handler: WithAuthHandler): WithAuthHandler => {
    return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
      if (!user.workspaceId) return handler(req, ctx, user)

      const check = await subscriptionService.canUseFeature(user.workspaceId, feature)
      if (!check.allowed) return limitExceeded(check)

      return handler(req, ctx, user)
    }) as WithAuthHandler
  }
}

// ─── Dynamic upload limit (reads file size from FormData) ─────────────────────

export function requireDynamicStorageLimit(handler: WithAuthHandler): WithAuthHandler {
  return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
    if (!user.workspaceId) return handler(req, ctx, user)

    // Clone request so we can read formData and still pass original to handler
    const clone    = req.clone()
    const formData = await clone.formData().catch(() => null)
    const file     = formData?.get("file")
    const sizeMb   = file instanceof File ? file.size / (1024 * 1024) : 0

    const check = await subscriptionService.canUploadFile(user.workspaceId, sizeMb)
    if (!check.allowed) return limitExceeded(check)

    return handler(req, ctx, user)
  }) as WithAuthHandler
}
