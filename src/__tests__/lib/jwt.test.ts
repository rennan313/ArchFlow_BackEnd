import { describe, it, expect } from "vitest"
import {
  signAccessToken, verifyAccessToken,
  signRefreshToken, verifyRefreshToken,
  buildPayload,
} from "@/lib/jwt"
import type { JwtPayload } from "@/lib/jwt"

const mockUser = {
  id:            "user-123",
  email:         "test@example.com",
  role:          "USER",
  workspaceId:   "ws-123",
  workspaceRole: "OWNER",
}

describe("buildPayload", () => {
  it("maps user fields to JWT payload", () => {
    const payload = buildPayload(mockUser)

    expect(payload.sub).toBe(mockUser.id)
    expect(payload.email).toBe(mockUser.email)
    expect(payload.role).toBe(mockUser.role)
    expect(payload.workspaceId).toBe(mockUser.workspaceId)
  })

  it("defaults workspaceRole to OWNER when omitted", () => {
    const payload = buildPayload({ ...mockUser, workspaceRole: undefined })
    expect(payload.workspaceRole).toBe("OWNER")
  })
})

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a valid payload", () => {
    const payload = buildPayload(mockUser)
    const token   = signAccessToken(payload)
    const decoded = verifyAccessToken(token)

    expect(decoded.sub).toBe(payload.sub)
    expect(decoded.email).toBe(payload.email)
    expect(decoded.workspaceId).toBe(payload.workspaceId)
  })

  it("throws on tampered token", () => {
    const token   = signAccessToken(buildPayload(mockUser))
    const tampered = token.slice(0, -5) + "XXXXX"

    expect(() => verifyAccessToken(tampered)).toThrow()
  })
})

describe("signRefreshToken / verifyRefreshToken", () => {
  it("round-trips a valid payload", () => {
    const payload = buildPayload(mockUser)
    const token   = signRefreshToken(payload)
    const decoded = verifyRefreshToken(token)

    expect(decoded.sub).toBe(payload.sub)
  })
})
