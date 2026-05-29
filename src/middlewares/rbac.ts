import type { NextRequest } from "next/server"
import { withAuth, type WithAuthHandler } from "./auth"
import { forbidden } from "@/lib/response"
import type { JwtPayload } from "@/lib/jwt"

// ─── Role hierarchy ───────────────────────────────────────────────────────────

const ROLE_RANK: Record<string, number> = {
  VIEWER:    0,
  ASSISTANT: 1,
  DESIGNER:  2,
  ARCHITECT: 3,
  ADMIN:     4,
  OWNER:     5,
}

// ─── Permission map ───────────────────────────────────────────────────────────

const PERMISSIONS: Record<string, string[]> = {
  OWNER:     ["*"],
  ADMIN:     ["read:*","manage:clients","manage:proposals","manage:opportunities","invite:users","manage:branding"],
  ARCHITECT: ["read:*","create:proposals","manage:clients","manage:opportunities","manage:briefings"],
  DESIGNER:  ["read:*","upload:media","manage:moodboards"],
  ASSISTANT: ["read:*","create:briefings","update:opportunities"],
  VIEWER:    ["read:*"],
}

export function hasPermission(role: string, permission: string): boolean {
  const perms = PERMISSIONS[role] ?? []
  if (perms.includes("*")) return true
  if (perms.includes(permission)) return true
  if (permission.includes(":") && perms.includes(`${permission.split(":")[0]}:*`)) return true
  return false
}

// ─── Middleware factories ─────────────────────────────────────────────────────

type Ctx = { params: Promise<Record<string, string>> }

export function requireRole(...roles: string[]) {
  return (handler: WithAuthHandler): WithAuthHandler => {
    return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
      const userRole = user.workspaceRole ?? "VIEWER"
      const allowed  = roles.some((r) => ROLE_RANK[userRole] >= ROLE_RANK[r])
      if (!allowed) return forbidden(`Role ${userRole} cannot perform this action. Requires: ${roles.join(" | ")}`)
      return handler(req, ctx, user)
    }) as WithAuthHandler
  }
}

export function requirePermission(permission: string) {
  return (handler: WithAuthHandler): WithAuthHandler => {
    return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
      const userRole = user.workspaceRole ?? "VIEWER"
      if (!hasPermission(userRole, permission)) {
        return forbidden(`Permission denied: ${permission}`)
      }
      return handler(req, ctx, user)
    }) as WithAuthHandler
  }
}

// ─── Composed: withAuth + role check ─────────────────────────────────────────

export function withRole(minRole: string, handler: WithAuthHandler) {
  return withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
    const userRole = user.workspaceRole ?? "VIEWER"
    if (ROLE_RANK[userRole] < ROLE_RANK[minRole]) {
      return forbidden(`Requires ${minRole} or above`)
    }
    return handler(req, ctx, user)
  })
}
