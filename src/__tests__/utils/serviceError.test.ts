import { describe, it, expect } from "vitest"
import { ZodError, z } from "zod"
import { handleServiceError } from "@/utils/serviceError"
import { AppError, ErrorCode } from "@/lib/errors"

describe("handleServiceError", () => {
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

  it("maps AppError.INVALID_CREDENTIALS to 401", async () => {
    const err = new AppError(ErrorCode.INVALID_CREDENTIALS)
    const res = handleServiceError(err)
    expect(res.status).toBe(401)
  })

  it("maps AppError.USER_NOT_FOUND to 404", async () => {
    const err = new AppError(ErrorCode.USER_NOT_FOUND)
    const res = handleServiceError(err)
    expect(res.status).toBe(404)
  })

  it("maps AppError.EMAIL_TAKEN to 409", async () => {
    const err = new AppError(ErrorCode.EMAIL_TAKEN)
    const res = handleServiceError(err)
    expect(res.status).toBe(409)
  })

  it("returns 500 for unknown errors", async () => {
    const err = new Error("Something completely unexpected")
    const res = handleServiceError(err)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("handles INVALID_TRANSITION string format", async () => {
    const err = new Error("INVALID_TRANSITION:DRAFT:APPROVED:REVIEW,SENT")
    const res = handleServiceError(err)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toContain("DRAFT")
    expect(body.message).toContain("APPROVED")
  })
})
