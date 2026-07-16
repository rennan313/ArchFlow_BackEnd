import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { withTransactionRetry, isTransientTransactionError } from "@/lib/transactionRetry"
import { logger } from "@/lib/logger"

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

function transientError() {
  return new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock. Please retry your transaction", {
    code: "P2034",
    clientVersion: "test",
  })
}

describe("isTransientTransactionError", () => {
  it("recognizes Prisma P2034", () => {
    expect(isTransientTransactionError(transientError())).toBe(true)
  })

  it("recognizes TransientTransactionError/WriteConflict by message as a fallback", () => {
    expect(isTransientTransactionError(new Error("MongoServerError: WriteConflict"))).toBe(true)
    expect(isTransientTransactionError(new Error("Label: TransientTransactionError"))).toBe(true)
  })

  it("does not classify an unrelated error as transient", () => {
    expect(isTransientTransactionError(new Error("Installment not found"))).toBe(false)
    expect(isTransientTransactionError(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }))).toBe(false)
  })
})

describe("withTransactionRetry", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns the result immediately on first success — no retry overhead for the common case", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    const result = await withTransactionRetry(fn, { baseDelayMs: 1 })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on a transient conflict and succeeds on a later attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(transientError())
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce("recovered")

    const result = await withTransactionRetry(fn, { baseDelayMs: 1 })

    expect(result).toBe("recovered")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("gives up after maxAttempts and throws the last transient error", async () => {
    const fn = vi.fn().mockRejectedValue(transientError())

    await expect(withTransactionRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow(Prisma.PrismaClientKnownRequestError)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("does not retry a non-transient error — fails immediately on the first attempt", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Installment not found"))

    await expect(withTransactionRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("Installment not found")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  // RC-3.4 — the `context` option is what lets a retry/conflict/exhaustion
  // log line be traced back to the specific operation and request that
  // caused it, instead of being anonymous noise across every financial
  // write in the module.
  it("merges the provided context into every log line, tagged with a stable `event`", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce("recovered")

    await withTransactionRetry(fn, { baseDelayMs: 1, context: { correlationId: "corr-1", op: "registerPayment" } })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "corr-1", op: "registerPayment", event: "transactional_conflict" }),
      expect.any(String),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "corr-1", op: "registerPayment", event: "retry_executed" }),
      expect.any(String),
    )
  })

  it("tags the final failure with event: retry_exhausted once maxAttempts is reached", async () => {
    const fn = vi.fn().mockRejectedValue(transientError())

    await expect(withTransactionRetry(fn, { maxAttempts: 2, baseDelayMs: 1, context: { op: "cancelIfNoPayments" } })).rejects.toThrow()

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ op: "cancelIfNoPayments", event: "retry_exhausted" }),
      expect.any(String),
    )
  })
})
