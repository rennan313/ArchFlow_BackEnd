import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { signAccessToken, buildPayload, type JwtPayload } from "@/lib/jwt"

vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { canWrite: vi.fn() },
}))

import { withWorkspace, withWorkspaceNoBillingGate } from "@/middlewares/auth"
import { subscriptionService } from "@/services/subscription.service"

const canWrite = vi.mocked(subscriptionService.canWrite)

function tokenFor(workspaceId: string | null = "ws-1"): string {
  const payload: JwtPayload = buildPayload({
    id: "user-1", email: "test@test.com", role: "USER", workspaceId, workspaceRole: "OWNER",
  })
  return signAccessToken(payload)
}

function requestWith(method: string, token: string | null): NextRequest {
  const headers = new Headers()
  if (token) headers.set("authorization", `Bearer ${token}`)
  return new NextRequest("http://localhost/api/test", { method, headers })
}

const ctx = { params: Promise.resolve({}) }

async function probeHandler() {
  return new Response(JSON.stringify({ reached: true }), { status: 200 })
}

describe("withWorkspace — trial/subscription write-gate", () => {
  beforeEach(() => vi.clearAllMocks())

  const handler = withWorkspace(probeHandler)

  it("GET passes without ever calling canWrite", async () => {
    const res = await handler(requestWith("GET", tokenFor()), ctx)
    expect(res.status).toBe(200)
    expect(canWrite).not.toHaveBeenCalled()
  })

  it("HEAD and OPTIONS also pass without calling canWrite", async () => {
    for (const method of ["HEAD", "OPTIONS"]) {
      const res = await handler(requestWith(method, tokenFor()), ctx)
      expect(res.status).toBe(200)
    }
    expect(canWrite).not.toHaveBeenCalled()
  })

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s is blocked with 403 + exact message when canWrite is false",
    async (method) => {
      canWrite.mockResolvedValue(false)
      const res  = await handler(requestWith(method, tokenFor()), ctx)
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.message).toBe("Seu período de avaliação terminou.")
      expect(canWrite).toHaveBeenCalledWith("ws-1")
    },
  )

  it.each(["POST", "PUT", "PATCH", "DELETE"])("%s passes through when canWrite is true", async (method) => {
    canWrite.mockResolvedValue(true)
    const res = await handler(requestWith(method, tokenFor()), ctx)
    expect(res.status).toBe(200)
  })

  it("rejects a caller with no workspace before canWrite is ever called", async () => {
    const res = await handler(requestWith("POST", tokenFor(null)), ctx)
    expect(res.status).toBe(403)
    expect(canWrite).not.toHaveBeenCalled()
  })
})

describe("withWorkspaceNoBillingGate — exempt from the write-gate", () => {
  beforeEach(() => vi.clearAllMocks())

  const handler = withWorkspaceNoBillingGate(probeHandler)

  it("a write passes even when canWrite would have returned false — it's never called", async () => {
    canWrite.mockResolvedValue(false)
    const res = await handler(requestWith("PATCH", tokenFor()), ctx)
    expect(res.status).toBe(200)
    expect(canWrite).not.toHaveBeenCalled()
  })

  it("still rejects a caller with no workspace", async () => {
    const res = await handler(requestWith("PATCH", tokenFor(null)), ctx)
    expect(res.status).toBe(403)
  })
})
