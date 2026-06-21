import { describe, it, expect } from "vitest"
import { ZodError, z } from "zod"
import { handleServiceError } from "@/utils/serviceError"
import { AppError, ErrorCode } from "@/lib/errors"

// ── ZodError ─────────────────────────────────────────────────────────────────

describe("handleServiceError — ZodError", () => {
  it("returns 400 with field errors for ZodError", async () => {
    const schema = z.object({ email: z.string().email() })
    let zodErr: ZodError | null = null
    try { schema.parse({ email: "not-an-email" }) } catch (e) { zodErr = e as ZodError }

    const res  = handleServiceError(zodErr!)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.errors).toHaveProperty("email")
  })

  it("returns 400 with multiple field errors when several fields are invalid", async () => {
    const schema = z.object({ email: z.string().email(), name: z.string().min(2) })
    let zodErr: ZodError | null = null
    try { schema.parse({ email: "bad", name: "x" }) } catch (e) { zodErr = e as ZodError }

    const res  = handleServiceError(zodErr!)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(Object.keys(body.errors).length).toBeGreaterThanOrEqual(1)
  })
})

// ── Auth ErrorCodes ───────────────────────────────────────────────────────────

describe("handleServiceError — auth AppErrors", () => {
  it("maps INVALID_CREDENTIALS to 401", async () => {
    const res = handleServiceError(new AppError(ErrorCode.INVALID_CREDENTIALS))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("maps USE_GOOGLE to 401", async () => {
    const res = handleServiceError(new AppError(ErrorCode.USE_GOOGLE))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.message).toMatch(/google/i)
  })

  it("maps INVALID_REFRESH_TOKEN to 401", async () => {
    const res = handleServiceError(new AppError(ErrorCode.INVALID_REFRESH_TOKEN))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.message).toMatch(/refresh/i)
  })

  it("maps INVALID_OR_EXPIRED_TOKEN to 400", async () => {
    const res = handleServiceError(new AppError(ErrorCode.INVALID_OR_EXPIRED_TOKEN))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toMatch(/token/i)
  })

  it("maps EMAIL_TAKEN to 409", async () => {
    const res = handleServiceError(new AppError(ErrorCode.EMAIL_TAKEN))
    expect(res.status).toBe(409)
  })
})

// ── User ErrorCodes ───────────────────────────────────────────────────────────

describe("handleServiceError — user AppErrors", () => {
  it("maps USER_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.USER_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/user/i)
  })
})

// ── Domain ErrorCodes ─────────────────────────────────────────────────────────

describe("handleServiceError — domain AppErrors", () => {
  it("maps NOT_FOUND to 404 with default message", async () => {
    const res = handleServiceError(new AppError(ErrorCode.NOT_FOUND))
    expect(res.status).toBe(404)
  })

  it("maps STATE_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.STATE_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/state/i)
  })

  it("maps CITY_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.CITY_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/city/i)
  })

  it("maps CLIENT_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.CLIENT_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/client/i)
  })

  it("maps OPPORTUNITY_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.OPPORTUNITY_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/opportunity/i)
  })

  it("maps BRIEFING_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.BRIEFING_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/briefing/i)
  })

  it("maps FOLLOWUP_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.FOLLOWUP_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/follow/i)
  })

  it("maps VERSION_NOT_FOUND to 404", async () => {
    const res = handleServiceError(new AppError(ErrorCode.VERSION_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/version/i)
  })

  it("maps MEDIA_LIMIT_REACHED to 400", async () => {
    const res = handleServiceError(new AppError(ErrorCode.MEDIA_LIMIT_REACHED))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toMatch(/media/i)
  })

  // Fase 5 audit, P1 #2 — this used to fall through to the 500 default because
  // MEETING_NOT_FOUND had no entry in SERVICE_ERRORS, even though
  // meeting.service.ts already threw it correctly. Every GET/PUT/DELETE on a
  // missing or cross-tenant meeting id surfaced as a 500 "[Unhandled error]".
  it("maps MEETING_NOT_FOUND to 404 (regression: used to fall through to 500)", async () => {
    const res = handleServiceError(new AppError(ErrorCode.MEETING_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/meeting/i)
  })

  // Fase 5 audit, P0 #1 — thrown by src/lib/tenantGuard.ts whenever a
  // request references another workspace's client/project/proposal/opportunity/
  // folder. Must be 403, not 404, so it's visibly distinct from "doesn't exist".
  it("maps CROSS_TENANT_REFERENCE to 403", async () => {
    const res = handleServiceError(new AppError(ErrorCode.CROSS_TENANT_REFERENCE))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  // Same fall-through-to-500 bug class as MEETING_NOT_FOUND, found while
  // auditing every ErrorCode against SERVICE_ERRORS — thrown in
  // billing.service.ts/subscription.service.ts but never mapped.
  it("maps SUBSCRIPTION_NOT_FOUND to 404 (regression: used to fall through to 500)", async () => {
    const res = handleServiceError(new AppError(ErrorCode.SUBSCRIPTION_NOT_FOUND))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.message).toMatch(/subscription/i)
  })

  it("maps SUBSCRIPTION_ALREADY_EXISTS to 409 (regression: used to fall through to 500)", async () => {
    const res = handleServiceError(new AppError(ErrorCode.SUBSCRIPTION_ALREADY_EXISTS))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.message).toMatch(/subscription/i)
  })
})

// ── Workspace ErrorCodes ──────────────────────────────────────────────────────

describe("handleServiceError — workspace AppErrors", () => {
  it("maps CANNOT_CHANGE_OWNER_ROLE to 400", async () => {
    const res = handleServiceError(new AppError(ErrorCode.CANNOT_CHANGE_OWNER_ROLE))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toMatch(/owner/i)
  })

  it("maps CANNOT_REMOVE_OWNER to 400", async () => {
    const res = handleServiceError(new AppError(ErrorCode.CANNOT_REMOVE_OWNER))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toMatch(/owner/i)
  })
})

// ── INVALID_TRANSITION string format ─────────────────────────────────────────

describe("handleServiceError — INVALID_TRANSITION", () => {
  it("returns 400 with transition message including from/to states", async () => {
    const err = new Error("INVALID_TRANSITION:DRAFT:APPROVED:REVIEW,SENT")
    const res  = handleServiceError(err)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toContain("DRAFT")
    expect(body.message).toContain("APPROVED")
  })

  it("handles INVALID_TRANSITION with no allowed list", async () => {
    const err = new Error("INVALID_TRANSITION:APPROVED:DRAFT:")
    const res  = handleServiceError(err)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toContain("APPROVED")
    expect(body.message).toContain("DRAFT")
  })
})

// ── Legacy string-keyed aliases ───────────────────────────────────────────────

describe("handleServiceError — legacy string aliases (Error.message lookup)", () => {
  it("maps Error('INVALID_TOKEN') to 400 via message lookup", async () => {
    const res = handleServiceError(new Error("INVALID_TOKEN"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toMatch(/invalid/i)
  })

  it("maps Error('TOKEN_ALREADY_USED') to 400 via message lookup", async () => {
    const res = handleServiceError(new Error("TOKEN_ALREADY_USED"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toMatch(/already/i)
  })

  it("maps Error('TOKEN_EXPIRED') to 400 via message lookup", async () => {
    const res = handleServiceError(new Error("TOKEN_EXPIRED"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toMatch(/expired/i)
  })
})

// ── Unknown / unhandled errors ────────────────────────────────────────────────

describe("handleServiceError — unknown errors", () => {
  it("returns 500 for a generic Error not in the map", async () => {
    const err = new Error("Something completely unexpected")
    const res = handleServiceError(err)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("returns 500 for a thrown string", async () => {
    const res = handleServiceError("some string error")
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("returns 500 for a thrown plain object", async () => {
    const res = handleServiceError({ code: "UNKNOWN", detail: "something" })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("returns 500 for null", async () => {
    const res = handleServiceError(null)
    expect(res.status).toBe(500)
  })
})
