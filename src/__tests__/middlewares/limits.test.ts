import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { signAccessToken, buildPayload, type JwtPayload } from "@/lib/jwt"

vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { canWrite: vi.fn(), canCreateProposal: vi.fn() },
}))

import { requireProposalLimit } from "@/middlewares/limits"
import { subscriptionService } from "@/services/subscription.service"

const canWrite          = vi.mocked(subscriptionService.canWrite)
const canCreateProposal = vi.mocked(subscriptionService.canCreateProposal)

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

// Regression test for a confirmed live bug: requireProposalLimit used to wrap
// withAuth (not withWorkspace), so POST /api/proposals never went through the
// trial/subscription write-gate — a request against an expired-trial
// workspace returned 201 instead of 403. requireProposalLimit (and the other
// limits.ts guards) now build on withWorkspace, the same chokepoint every
// other domain route is gated through.
describe("requireProposalLimit — must run the trial/subscription write-gate", () => {
  beforeEach(() => vi.clearAllMocks())

  const handler = requireProposalLimit(probeHandler)

  it("blocks with 403 + exact message when the workspace is read-only, even if the proposal limit would allow it", async () => {
    canWrite.mockResolvedValue(false)
    canCreateProposal.mockResolvedValue({ allowed: true, plan: "STARTER" })

    const res  = await handler(requestWith("POST", tokenFor()), ctx)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.message).toBe("Seu período de avaliação terminou.")
    expect(canCreateProposal).not.toHaveBeenCalled() // never reached — the write-gate runs first
  })

  it("passes through to the plan-limit check when the workspace can write", async () => {
    canWrite.mockResolvedValue(true)
    canCreateProposal.mockResolvedValue({ allowed: true, plan: "STARTER" })

    const res = await handler(requestWith("POST", tokenFor()), ctx)
    expect(res.status).toBe(200)
    expect(canCreateProposal).toHaveBeenCalledWith("ws-1")
  })

  it("still blocks via the plan limit when the workspace can write but is over quota", async () => {
    canWrite.mockResolvedValue(true)
    canCreateProposal.mockResolvedValue({ allowed: false, plan: "STARTER", reason: "Plan STARTER allows 20 proposals/month." })

    const res = await handler(requestWith("POST", tokenFor()), ctx)
    expect(res.status).toBe(403)
  })

  it("rejects a caller with no workspace before any limit check runs", async () => {
    const res = await handler(requestWith("POST", tokenFor(null)), ctx)
    expect(res.status).toBe(403)
    expect(canWrite).not.toHaveBeenCalled()
    expect(canCreateProposal).not.toHaveBeenCalled()
  })
})
