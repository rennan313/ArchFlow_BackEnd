import { describe, it, expect } from "vitest"
import {
  credentialsRegisterSchema,
  credentialsSigninSchema,
  resetPasswordSchema,
  forgotPasswordSchema,
  loginSchema,
} from "@/validations/auth"

// ── credentialsRegisterSchema ─────────────────────────────────────────────────

describe("credentialsRegisterSchema", () => {
  const valid = { name: "John Doe", email: "john@example.com", password: "Password123" }

  it("accepts valid registration data", () => {
    expect(credentialsRegisterSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects an invalid email", () => {
    const result = credentialsRegisterSchema.safeParse({ ...valid, email: "not-an-email" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("email")
  })

  it("rejects a password shorter than 8 characters", () => {
    const result = credentialsRegisterSchema.safeParse({ ...valid, password: "Ab1" })
    expect(result.success).toBe(false)
    const msg = result.error?.issues[0].message
    expect(msg).toMatch(/8 characters/i)
  })

  it("rejects a password with no digits", () => {
    const result = credentialsRegisterSchema.safeParse({ ...valid, password: "OnlyLetters" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(/number/i)
  })

  it("rejects a password with no letters", () => {
    const result = credentialsRegisterSchema.safeParse({ ...valid, password: "12345678" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(/letter/i)
  })

  it("rejects a name shorter than 2 characters", () => {
    const result = credentialsRegisterSchema.safeParse({ ...valid, name: "J" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("name")
  })
})

// ── credentialsSigninSchema ───────────────────────────────────────────────────

describe("credentialsSigninSchema", () => {
  it("accepts valid credentials", () => {
    const result = credentialsSigninSchema.safeParse({ email: "a@b.com", password: "pass" })
    expect(result.success).toBe(true)
  })

  it("rejects missing email", () => {
    const result = credentialsSigninSchema.safeParse({ email: "", password: "pass" })
    expect(result.success).toBe(false)
  })

  it("rejects empty password", () => {
    const result = credentialsSigninSchema.safeParse({ email: "a@b.com", password: "" })
    expect(result.success).toBe(false)
  })
})

// ── forgotPasswordSchema ──────────────────────────────────────────────────────

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "test@test.com" }).success).toBe(true)
  })

  it("rejects a malformed email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-email" }).success).toBe(false)
  })
})

// ── resetPasswordSchema ───────────────────────────────────────────────────────

describe("resetPasswordSchema", () => {
  const valid = { token: "abc123def456", password: "NewPass123" }

  it("accepts valid token and password", () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects an empty token", () => {
    const result = resetPasswordSchema.safeParse({ ...valid, token: "" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(/required/i)
  })

  it("rejects a weak new password", () => {
    const result = resetPasswordSchema.safeParse({ ...valid, password: "short" })
    expect(result.success).toBe(false)
  })
})

// ── loginSchema ───────────────────────────────────────────────────────────────

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ email: "user@domain.com", password: "any" }).success).toBe(true)
  })

  it("rejects invalid email format", () => {
    expect(loginSchema.safeParse({ email: "bad", password: "pass" }).success).toBe(false)
  })

  it("rejects empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false)
  })
})
