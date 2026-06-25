import type { NextRequest } from "next/server"
import { withWorkspace, withWorkspaceNoBillingGate, type WithWorkspaceHandler, type RouteHandler } from "./auth"
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
//
// Mirrors the RBAC matrix (ArchFlow RBAC audit). `read:*` stays universal —
// every workspace member can see workspace data; what differs by role is
// who can create/update/delete/approve it.
//
// DESIGNER's "edit own project" exception is NOT expressed here as a blanket
// permission — it's enforced via requirePermissionOrOwner() at the route
// level, scoped to Project.userId, because permission strings alone can't
// express per-resource ownership.

const PERMISSIONS: Record<string, string[]> = {
  OWNER: ["*"],

  ADMIN: [
    "read:*",
    "create:clients", "update:clients", "delete:clients",
    "create:projects", "update:projects", "delete:projects",
    "create:proposals", "update:proposals", "approve:proposals", "delete:proposals",
    "create:opportunities", "update:opportunities", "delete:opportunities",
    "create:meetings", "update:meetings", "delete:meetings",
    "update:branding",
    "update:workspace", "invite:users", "remove:users", "change-role:users",
    "manage:briefings",
    "create:documents", "update:documents", "delete:documents",
    "update:tasks", "manage:automations",
    "create:proposal-templates", "update:proposal-templates", "delete:proposal-templates",
    "create:proposal-sections", "update:proposal-sections", "delete:proposal-sections",
    "create:proposal-blocks", "update:proposal-blocks", "delete:proposal-blocks", "share:proposal-blocks",
    "create:proposal-narratives", "update:proposal-narratives", "delete:proposal-narratives",
    // NOT billing:manage — billing stays OWNER-only.
  ],

  ARCHITECT: [
    "read:*",
    "create:clients", "update:clients", "delete:clients",
    "create:projects", "update:projects", "delete:projects",
    "create:proposals", "update:proposals", "approve:proposals", "delete:proposals",
    "create:opportunities", "update:opportunities", "delete:opportunities",
    "create:meetings", "update:meetings", "delete:meetings",
    "manage:briefings",
    "create:documents", "update:documents", "delete:documents",
    "update:tasks",
    "create:proposal-templates", "update:proposal-templates", "delete:proposal-templates",
    "create:proposal-sections", "update:proposal-sections", "delete:proposal-sections",
    "create:proposal-blocks", "update:proposal-blocks", "delete:proposal-blocks", "share:proposal-blocks",
    "create:proposal-narratives", "update:proposal-narratives", "delete:proposal-narratives",
    // No workspace/branding/billing administration, no manage:automations
    // (toggling automations on/off is OWNER/ADMIN-only, same tier as billing).
  ],

  DESIGNER: [
    "read:*",
    "upload:media",
    "manage:moodboards",
    "create:documents", "update:documents",
    "update:tasks",
    "create:proposal-templates", "update:proposal-templates",
    "create:proposal-sections", "update:proposal-sections",
    "create:proposal-blocks", "update:proposal-blocks", "share:proposal-blocks",
    // update:projects is intentionally absent here — DESIGNER may only edit
    // projects they created, enforced via requirePermissionOrOwner(). Same
    // reasoning applies to documents: no delete:documents for DESIGNER.
    // No delete:proposal-* either, same tier as documents.
  ],

  ASSISTANT: [
    "read:*",
    "create:clients", "update:clients",
    "create:proposals", "update:proposals",
    "create:opportunities", "update:opportunities",
    "create:meetings", "update:meetings",
    "manage:briefings",
    "create:documents", "update:documents",
    "update:tasks",
    // No delete, no approve, no admin, no billing.
  ],

  VIEWER: ["read:*"],
}

export function hasPermission(role: string, permission: string): boolean {
  const perms = PERMISSIONS[role] ?? []
  if (perms.includes("*")) return true
  if (perms.includes(permission)) return true
  if (permission.includes(":") && perms.includes(`${permission.split(":")[0]}:*`)) return true
  return false
}

// ─── Middleware factories — all built on withWorkspace ───────────────────────
//
// Every one of these guarantees a non-null workspaceId before the role/
// permission check runs, so route handlers never need their own
// `if (!user.workspaceId) return forbidden(...)` anymore — that check used to
// be duplicated by hand in every route that used the old requireRole/
// requirePermission (which wrapped withAuth, not withWorkspace).

export function requireWorkspaceRole(...roles: string[]) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const userRole = user.workspaceRole ?? "VIEWER"
      const allowed  = roles.some((r) => ROLE_RANK[userRole] >= ROLE_RANK[r])
      if (!allowed) return forbidden(`Role ${userRole} cannot perform this action. Requires: ${roles.join(" | ")}`)
      return handler(req, ctx, user, workspaceId)
    })
  }
}

/** Identical to requireWorkspaceRole, but built on withWorkspaceNoBillingGate
 *  instead of withWorkspace — used exclusively by PATCH /api/subscription/upgrade,
 *  the one write that must stay reachable even when the workspace is
 *  read-only (it's how the OWNER pays to unlock it). Do not reuse this for
 *  any other route. */
export function requireWorkspaceRoleNoBillingGate(...roles: string[]) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspaceNoBillingGate(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const userRole = user.workspaceRole ?? "VIEWER"
      const allowed  = roles.some((r) => ROLE_RANK[userRole] >= ROLE_RANK[r])
      if (!allowed) return forbidden(`Role ${userRole} cannot perform this action. Requires: ${roles.join(" | ")}`)
      return handler(req, ctx, user, workspaceId)
    })
  }
}

export function requireWorkspacePermission(permission: string) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const userRole = user.workspaceRole ?? "VIEWER"
      if (!hasPermission(userRole, permission)) {
        return forbidden(`Permission denied: ${permission}`)
      }
      return handler(req, ctx, user, workspaceId)
    })
  }
}

/** Passes if the caller has ANY of the listed permissions. Used where two
 *  different roles can reach the same action for different reasons — e.g.
 *  DESIGNER via "upload:media", ARCHITECT/ADMIN/ASSISTANT via "update:proposals". */
export function requireAnyWorkspacePermission(...permissions: string[]) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const userRole = user.workspaceRole ?? "VIEWER"
      if (!permissions.some((p) => hasPermission(userRole, p))) {
        return forbidden(`Permission denied: requires one of ${permissions.join(" | ")}`)
      }
      return handler(req, ctx, user, workspaceId)
    })
  }
}

/**
 * Like requireWorkspacePermission, but also allows the caller through if
 * they own the resource being acted on — even without the blanket
 * permission. Used for DESIGNER editing projects they created themselves.
 *
 * The ownership exception is intentionally scoped to an explicit allow-list
 * of roles (ownerExceptionRoles), not "any role lacking the permission" —
 * otherwise VIEWER (meant to be unconditionally read-only) would inherit an
 * edit exception just by having created something before being demoted.
 *
 * loadOwnerId resolves the resource's owning userId; return null if the
 * resource doesn't exist (the wrapped handler's own lookup will then 404).
 */
export function requirePermissionOrOwner(
  permission: string,
  ownerExceptionRoles: string[],
  loadOwnerId: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }, workspaceId: string) => Promise<string | null>,
) {
  return (handler: WithWorkspaceHandler): RouteHandler => {
    return withWorkspace(async (req: NextRequest, ctx, user: JwtPayload, workspaceId: string) => {
      const userRole = user.workspaceRole ?? "VIEWER"
      if (hasPermission(userRole, permission)) {
        return handler(req, ctx, user, workspaceId)
      }
      if (ownerExceptionRoles.includes(userRole)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ownerId = await loadOwnerId(req, ctx as any, workspaceId)
        if (ownerId && ownerId === user.sub) {
          return handler(req, ctx, user, workspaceId)
        }
      }
      return forbidden(`Permission denied: ${permission}`)
    })
  }
}
