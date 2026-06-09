import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppError, ErrorCode } from "@/lib/errors"

vi.mock("@/repositories/user.repository")
vi.mock("@/repositories/resetToken.repository")
vi.mock("@/repositories/refreshToken.repository")
vi.mock("@/lib/hash")
vi.mock("@/services/workspace.service")

import { authService } from "@/services/auth.service"
import { userRepository } from "@/repositories/user.repository"
import { resetTokenRepository } from "@/repositories/resetToken.repository"
import { comparePassword, hashPassword } from "@/lib/hash"
import { createMockUser } from "@/__tests__/mocks/repositories"

// ── authService.login ──────────────────────────────────────────────────────────

describe("authService.login", () => {
  const validInput = { email: "test@example.com", password: "ValidPass1" }

  beforeEach(() => vi.clearAllMocks())

  it("returns user and accessToken on valid credentials", async () => {
    const mockUser = createMockUser()
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser)
    vi.mocked(userRepository.update).mockResolvedValue(mockUser)
    vi.mocked(comparePassword).mockResolvedValue(true)

    const result = await authService.login(validInput)

    expect(result).toHaveProperty("accessToken")
    expect(result.user.email).toBe(mockUser.email)
    expect(result.user.id).toBe(mockUser.id)
    expect(userRepository.update).toHaveBeenCalledWith(mockUser.id, { lastLogin: expect.any(Date) })
  })

  it("throws INVALID_CREDENTIALS when user is not found", async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null)

    await expect(authService.login(validInput))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS })
  })

  it("throws INVALID_CREDENTIALS on wrong password", async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(createMockUser())
    vi.mocked(comparePassword).mockResolvedValue(false)

    await expect(authService.login(validInput))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS })
  })

  it("throws USE_GOOGLE when user has no password (Google account)", async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(
      createMockUser({ password: null })
    )

    await expect(authService.login(validInput))
      .rejects.toMatchObject({ code: ErrorCode.USE_GOOGLE })
  })
})

// ── authService.me ─────────────────────────────────────────────────────────────

describe("authService.me", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns user profile when user exists", async () => {
    const mockUser = createMockUser()
    vi.mocked(userRepository.findById).mockResolvedValue(mockUser)

    const result = await authService.me(mockUser.id)

    expect(result.id).toBe(mockUser.id)
    expect(result.email).toBe(mockUser.email)
    expect(result).not.toHaveProperty("password")
  })

  it("throws USER_NOT_FOUND when user does not exist", async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null)

    await expect(authService.me("non-existent-id"))
      .rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND })
  })
})

// ── authService.forgotPassword ─────────────────────────────────────────────────

describe("authService.forgotPassword", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null silently for unknown email (prevents enumeration)", async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null)

    const result = await authService.forgotPassword({ email: "unknown@example.com" })

    expect(result).toBeNull()
    expect(resetTokenRepository.create).not.toHaveBeenCalled()
  })

  it("returns null silently for Google-only account (no password)", async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(
      createMockUser({ password: null })
    )

    const result = await authService.forgotPassword({ email: "google@example.com" })

    expect(result).toBeNull()
  })

  it("creates reset token and returns raw token for email dispatch", async () => {
    const mockUser = createMockUser()
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser)
    vi.mocked(resetTokenRepository.deleteByUserId).mockResolvedValue(undefined as never)
    vi.mocked(resetTokenRepository.create).mockResolvedValue(undefined as never)

    const result = await authService.forgotPassword({ email: mockUser.email })

    expect(result).not.toBeNull()
    expect(result!.token).toBeTruthy()
    expect(result!.user.email).toBe(mockUser.email)
    expect(resetTokenRepository.deleteByUserId).toHaveBeenCalledWith(mockUser.id)
    expect(resetTokenRepository.create).toHaveBeenCalledWith(
      mockUser.id,
      expect.any(String),          // SHA-256 hash
      expect.any(Date),             // expiry
    )
  })
})

// ── authService.resetPassword ──────────────────────────────────────────────────

describe("authService.resetPassword", () => {
  beforeEach(() => vi.clearAllMocks())

  const mockToken = {
    id:        "token-1",
    userId:    "user-1",
    token:     "hashed-token",
    used:      false,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    createdAt: new Date(),
  }

  it("resets password when token is valid", async () => {
    vi.mocked(resetTokenRepository.findByToken).mockResolvedValue(mockToken as never)
    vi.mocked(hashPassword).mockResolvedValue("$2b$12$newhash")
    vi.mocked(userRepository.update).mockResolvedValue(createMockUser())
    vi.mocked(resetTokenRepository.markUsed).mockResolvedValue(undefined as never)

    await authService.resetPassword({ token: "raw-token", password: "NewPass123" })

    expect(userRepository.update).toHaveBeenCalledWith("user-1", { password: "$2b$12$newhash" })
    expect(resetTokenRepository.markUsed).toHaveBeenCalledWith("token-1")
  })

  it("throws INVALID_OR_EXPIRED_TOKEN for non-existent token", async () => {
    vi.mocked(resetTokenRepository.findByToken).mockResolvedValue(null)

    await expect(authService.resetPassword({ token: "bad", password: "NewPass123" }))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_OR_EXPIRED_TOKEN })
  })

  it("throws INVALID_OR_EXPIRED_TOKEN for already-used token", async () => {
    vi.mocked(resetTokenRepository.findByToken).mockResolvedValue({ ...mockToken, used: true } as never)

    await expect(authService.resetPassword({ token: "used-token", password: "NewPass123" }))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_OR_EXPIRED_TOKEN })
  })

  it("throws INVALID_OR_EXPIRED_TOKEN for expired token", async () => {
    vi.mocked(resetTokenRepository.findByToken).mockResolvedValue({
      ...mockToken, expiresAt: new Date(Date.now() - 1000),
    } as never)

    await expect(authService.resetPassword({ token: "expired", password: "NewPass123" }))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_OR_EXPIRED_TOKEN })
  })
})

// ── authService.register ───────────────────────────────────────────────────────

describe("authService.register", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws EMAIL_TAKEN when email already exists", async () => {
    const { prisma } = await import("@/lib/prisma")
    vi.mocked(prisma.user.findUnique).mockResolvedValue(createMockUser() as never)

    await expect(authService.register({ name: "Test", email: "test@example.com", password: "TestPass1" }))
      .rejects.toMatchObject({ code: ErrorCode.EMAIL_TAKEN })
  })
})
