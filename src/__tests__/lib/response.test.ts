import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  ok, created, noContent,
  badRequest, unauthorized, forbidden,
  notFound, conflict,
  internalError, tooManyRequests,
  fromZodError,
} from "@/lib/response"

// ── 2xx success responses ─────────────────────────────────────────────────────

describe("ok", () => {
  it("returns 200 with data and success=true", async () => {
    const res  = ok({ id: 1, name: "Test" })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ id: 1, name: "Test" })
    expect(body.message).toBeUndefined()
  })

  it("includes optional message", async () => {
    const res  = ok({ id: 1 }, "Resource created")
    const body = await res.json()
    expect(body.message).toBe("Resource created")
  })

  it("includes optional pagination metadata", async () => {
    const pagination = { total: 50, page: 2, limit: 10, totalPages: 5 }
    const res  = ok([], undefined, pagination)
    const body = await res.json()
    expect(body.pagination).toEqual(pagination)
  })

  it("accepts null data", async () => {
    const res  = ok(null)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toBeNull()
  })
})

describe("created", () => {
  it("returns 201 with data", async () => {
    const res  = created({ id: "new-id" })
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ id: "new-id" })
  })

  it("includes optional message", async () => {
    const res  = created({ id: "x" }, "Successfully created")
    const body = await res.json()
    expect(body.message).toBe("Successfully created")
  })
})

describe("noContent", () => {
  it("returns 204 with null body", () => {
    const res = noContent()
    expect(res.status).toBe(204)
    // 204 has no body — body() returns empty or null
    expect(res.body).toBeNull()
  })
})

// ── 4xx client error responses ────────────────────────────────────────────────

describe("badRequest", () => {
  it("returns 400 with message and success=false", async () => {
    const res  = badRequest("Invalid input")
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Invalid input")
  })

  it("includes field errors when provided", async () => {
    const errors = { email: ["Invalid email format"], name: ["Too short"] }
    const res  = badRequest("Validation failed", errors)
    const body = await res.json()
    expect(body.errors).toEqual(errors)
    expect(body.message).toBe("Validation failed")
  })
})

describe("unauthorized", () => {
  it("returns 401 with default message", async () => {
    const res  = unauthorized()
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Unauthorized")
  })

  it("accepts custom message", async () => {
    const res  = unauthorized("Invalid token")
    const body = await res.json()
    expect(body.message).toBe("Invalid token")
  })
})

describe("forbidden", () => {
  it("returns 403 with default message", async () => {
    const res  = forbidden()
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Forbidden")
  })

  it("accepts custom message", async () => {
    const res  = forbidden("Insufficient permissions")
    const body = await res.json()
    expect(body.message).toBe("Insufficient permissions")
  })
})

describe("notFound", () => {
  it("returns 404 with default message", async () => {
    const res  = notFound()
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Resource not found")
  })

  it("accepts custom message", async () => {
    const res  = notFound("Proposal not found")
    const body = await res.json()
    expect(body.message).toBe("Proposal not found")
  })
})

describe("conflict", () => {
  it("returns 409 with the given message", async () => {
    const res  = conflict("Email already exists")
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Email already exists")
  })
})

// ── 5xx server error responses ────────────────────────────────────────────────

describe("internalError", () => {
  it("returns 500 with default message", async () => {
    const res  = internalError()
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Internal server error")
  })

  it("accepts custom message", async () => {
    const res  = internalError("Database connection failed")
    const body = await res.json()
    expect(body.message).toBe("Database connection failed")
  })
})

describe("tooManyRequests", () => {
  it("returns 429 with default message", async () => {
    const res  = tooManyRequests()
    const body = await res.json()
    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Too many requests")
  })

  it("accepts custom message", async () => {
    const res  = tooManyRequests("Rate limit exceeded — try again in 60s")
    const body = await res.json()
    expect(body.message).toBe("Rate limit exceeded — try again in 60s")
  })
})

// ── fromZodError ──────────────────────────────────────────────────────────────

describe("fromZodError", () => {
  function parseAndCapture<T>(schema: z.ZodSchema<T>, data: unknown): z.ZodError {
    try { schema.parse(data) } catch (e) { return e as z.ZodError }
    throw new Error("Expected parse to fail")
  }

  it("returns 400 with structured errors for a single field", async () => {
    const schema = z.object({ email: z.string().email() })
    const err  = parseAndCapture(schema, { email: "not-valid" })
    const res  = fromZodError(err)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toBe("Validation failed")
    expect(body.errors.email).toContain("Invalid email")
  })

  it("returns errors for multiple fields", async () => {
    const schema = z.object({ name: z.string().min(2), age: z.number().int().positive() })
    const err  = parseAndCapture(schema, { name: "x", age: -1 })
    const res  = fromZodError(err)
    const body = await res.json()

    expect(Object.keys(body.errors)).toHaveLength(2)
  })

  it("handles nested field paths with dot notation", async () => {
    const schema = z.object({ address: z.object({ zip: z.string().length(8) }) })
    const err  = parseAndCapture(schema, { address: { zip: "123" } })
    const res  = fromZodError(err)
    const body = await res.json()

    expect(body.errors).toHaveProperty("address.zip")
  })

  it("accumulates multiple errors for the same field", async () => {
    const schema = z.object({
      password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
    })
    const err  = parseAndCapture(schema, { password: "a" })
    const res  = fromZodError(err)
    const body = await res.json()

    expect(body.errors.password.length).toBeGreaterThanOrEqual(1)
  })
})
