import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { signAccessToken, buildPayload, type JwtPayload } from "@/lib/jwt"
import {
  hasPermission,
  requireWorkspaceRole,
  requireWorkspacePermission,
  requireAnyWorkspacePermission,
  requirePermissionOrOwner,
} from "@/middlewares/rbac"

type Role = "OWNER" | "ADMIN" | "ARCHITECT" | "DESIGNER" | "ASSISTANT" | "VIEWER"

const WORKSPACE_A = "ws-aaaaaaaaaaaaaaaaaaaaaaaa"
const WORKSPACE_B = "ws-bbbbbbbbbbbbbbbbbbbbbbbb"

function tokenFor(role: Role, opts: { userId?: string; workspaceId?: string | null } = {}): string {
  const payload: JwtPayload = buildPayload({
    id:            opts.userId ?? `user-${role.toLowerCase()}`,
    email:         `${role.toLowerCase()}@test.com`,
    role:          "USER",
    workspaceId:   opts.workspaceId === undefined ? WORKSPACE_A : opts.workspaceId,
    workspaceRole: role,
  })
  return signAccessToken(payload)
}

function requestWith(token: string | null): NextRequest {
  const headers = new Headers()
  if (token) headers.set("authorization", `Bearer ${token}`)
  return new NextRequest("http://localhost/api/test", { headers })
}

const ctx = { params: Promise.resolve({}) }

/** A bottom-of-the-chain handler that proves it was reached, and with what workspaceId. */
async function probeHandler(_req: NextRequest, _ctx: unknown, user: JwtPayload, workspaceId: string) {
  return new Response(JSON.stringify({ reached: true, workspaceId, userId: user.sub }), { status: 200 })
}

async function statusAndBody(res: Response) {
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ── hasPermission — table driven across all 6 roles ──────────────────────────

describe("hasPermission", () => {
  it("OWNER has every permission, including billing", () => {
    expect(hasPermission("OWNER", "billing:manage")).toBe(true)
    expect(hasPermission("OWNER", "delete:proposals")).toBe(true)
    expect(hasPermission("OWNER", "anything:whatsoever")).toBe(true)
  })

  it("ADMIN has full operational access but not billing", () => {
    expect(hasPermission("ADMIN", "delete:clients")).toBe(true)
    expect(hasPermission("ADMIN", "approve:proposals")).toBe(true)
    expect(hasPermission("ADMIN", "invite:users")).toBe(true)
    expect(hasPermission("ADMIN", "billing:manage")).toBe(false)
  })

  it("ARCHITECT has full resource CRUD but no workspace/billing administration", () => {
    expect(hasPermission("ARCHITECT", "delete:proposals")).toBe(true)
    expect(hasPermission("ARCHITECT", "approve:proposals")).toBe(true)
    expect(hasPermission("ARCHITECT", "update:branding")).toBe(false)
    expect(hasPermission("ARCHITECT", "invite:users")).toBe(false)
    expect(hasPermission("ARCHITECT", "billing:manage")).toBe(false)
  })

  it("DESIGNER is read + media/moodboards only, no blanket project edit", () => {
    expect(hasPermission("DESIGNER", "read:anything")).toBe(true)
    expect(hasPermission("DESIGNER", "upload:media")).toBe(true)
    expect(hasPermission("DESIGNER", "manage:moodboards")).toBe(true)
    expect(hasPermission("DESIGNER", "update:projects")).toBe(false)
    expect(hasPermission("DESIGNER", "delete:clients")).toBe(false)
  })

  it("ASSISTANT can create/update operationally but never delete or approve", () => {
    expect(hasPermission("ASSISTANT", "create:proposals")).toBe(true)
    expect(hasPermission("ASSISTANT", "update:opportunities")).toBe(true)
    expect(hasPermission("ASSISTANT", "delete:clients")).toBe(false)
    expect(hasPermission("ASSISTANT", "approve:proposals")).toBe(false)
    expect(hasPermission("ASSISTANT", "update:branding")).toBe(false)
  })

  it("VIEWER is read-only", () => {
    expect(hasPermission("VIEWER", "read:anything")).toBe(true)
    expect(hasPermission("VIEWER", "create:clients")).toBe(false)
    expect(hasPermission("VIEWER", "update:proposals")).toBe(false)
    expect(hasPermission("VIEWER", "delete:meetings")).toBe(false)
  })

  it("unknown role defaults to no permissions", () => {
    expect(hasPermission("NOT_A_REAL_ROLE", "read:*")).toBe(false)
  })
})

// ── requireWorkspaceRole — rank-based escalation ──────────────────────────────

describe("requireWorkspaceRole", () => {
  const handler = requireWorkspaceRole("ADMIN")(probeHandler)

  it("allows a role at or above the required rank", async () => {
    const res = await handler(requestWith(tokenFor("ADMIN")), ctx)
    expect(res.status).toBe(200)
  })

  it("allows OWNER through an ADMIN-gated route (rank above)", async () => {
    const res = await handler(requestWith(tokenFor("OWNER")), ctx)
    expect(res.status).toBe(200)
  })

  it("denies a role below the required rank — privilege escalation attempt", async () => {
    const res = await handler(requestWith(tokenFor("ARCHITECT")), ctx)
    const { status } = await statusAndBody(res)
    expect(status).toBe(403)
  })

  it("denies VIEWER outright", async () => {
    const res = await handler(requestWith(tokenFor("VIEWER")), ctx)
    expect(res.status).toBe(403)
  })

  it("denies a caller with no workspace before the role check even runs", async () => {
    const res = await handler(requestWith(tokenFor("OWNER", { workspaceId: null })), ctx)
    expect(res.status).toBe(403)
  })

  it("denies an unauthenticated request", async () => {
    const res = await handler(requestWith(null), ctx)
    expect(res.status).toBe(401)
  })
})

// ── requireWorkspacePermission ────────────────────────────────────────────────

describe("requireWorkspacePermission — delete:clients", () => {
  const handler = requireWorkspacePermission("delete:clients")(probeHandler)

  it.each<Role>(["OWNER", "ADMIN", "ARCHITECT"])("allows %s", async (role) => {
    const res = await handler(requestWith(tokenFor(role)), ctx)
    expect(res.status).toBe(200)
  })

  it.each<Role>(["DESIGNER", "ASSISTANT", "VIEWER"])(
    "denies %s — would be a privilege escalation if allowed",
    async (role) => {
      const res = await handler(requestWith(tokenFor(role)), ctx)
      expect(res.status).toBe(403)
    },
  )
})

describe("requireWorkspacePermission — create:proposals", () => {
  const handler = requireWorkspacePermission("create:proposals")(probeHandler)

  it.each<Role>(["OWNER", "ADMIN", "ARCHITECT", "ASSISTANT"])("allows %s", async (role) => {
    const res = await handler(requestWith(tokenFor(role)), ctx)
    expect(res.status).toBe(200)
  })

  it.each<Role>(["DESIGNER", "VIEWER"])("denies %s", async (role) => {
    const res = await handler(requestWith(tokenFor(role)), ctx)
    expect(res.status).toBe(403)
  })
})

// ── requireAnyWorkspacePermission — proposal media (upload:media OR update:proposals) ──

describe("requireAnyWorkspacePermission(upload:media, update:proposals)", () => {
  const handler = requireAnyWorkspacePermission("upload:media", "update:proposals")(probeHandler)

  it("allows DESIGNER via upload:media", async () => {
    const res = await handler(requestWith(tokenFor("DESIGNER")), ctx)
    expect(res.status).toBe(200)
  })

  it("allows ASSISTANT via update:proposals", async () => {
    const res = await handler(requestWith(tokenFor("ASSISTANT")), ctx)
    expect(res.status).toBe(200)
  })

  it("denies VIEWER, who has neither permission", async () => {
    const res = await handler(requestWith(tokenFor("VIEWER")), ctx)
    expect(res.status).toBe(403)
  })
})

// ── requirePermissionOrOwner — DESIGNER editing own vs. someone else's project ──

describe("requirePermissionOrOwner(update:projects, ownership fallback)", () => {
  const OWNER_USER_ID = "user-designer"

  function withOwner(ownerId: string | null) {
    return requirePermissionOrOwner("update:projects", ["DESIGNER"], async () => ownerId)(probeHandler)
  }

  it("ARCHITECT passes unconditionally via blanket permission, even if not the owner", async () => {
    const handler = withOwner("someone-else")
    const res = await handler(requestWith(tokenFor("ARCHITECT", { userId: "user-architect" })), ctx)
    expect(res.status).toBe(200)
  })

  it("DESIGNER passes when they own the resource", async () => {
    const handler = withOwner(OWNER_USER_ID)
    const res = await handler(requestWith(tokenFor("DESIGNER", { userId: OWNER_USER_ID })), ctx)
    expect(res.status).toBe(200)
  })

  it("DESIGNER is denied when editing a project they do not own — escalation attempt", async () => {
    const handler = withOwner("a-different-user")
    const res = await handler(requestWith(tokenFor("DESIGNER", { userId: OWNER_USER_ID })), ctx)
    expect(res.status).toBe(403)
  })

  it("VIEWER is denied even when they happen to own the resource — read-only has no ownership exception", async () => {
    const handler = withOwner(OWNER_USER_ID)
    const res = await handler(requestWith(tokenFor("VIEWER", { userId: OWNER_USER_ID })), ctx)
    expect(res.status).toBe(403)
  })
})

// ── Cross-tenant isolation at the middleware layer ────────────────────────────

describe("cross-tenant isolation", () => {
  const handler = requireWorkspacePermission("read:*")(probeHandler)

  it("always derives workspaceId from the caller's own JWT, never from elsewhere", async () => {
    const resA = await handler(requestWith(tokenFor("OWNER", { workspaceId: WORKSPACE_A })), ctx)
    const resB = await handler(requestWith(tokenFor("OWNER", { workspaceId: WORKSPACE_B })), ctx)

    const bodyA = await resA.json()
    const bodyB = await resB.json()

    expect(bodyA.workspaceId).toBe(WORKSPACE_A)
    expect(bodyB.workspaceId).toBe(WORKSPACE_B)
    expect(bodyA.workspaceId).not.toBe(bodyB.workspaceId)
  })

  it("a forged/tampered token is rejected before any workspace or role logic runs", async () => {
    const token = tokenFor("OWNER")
    const tampered = token.slice(0, -5) + "XXXXX"
    const res = await handler(requestWith(tampered), ctx)
    expect(res.status).toBe(401)
  })
})
