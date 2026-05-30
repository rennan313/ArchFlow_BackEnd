import { vi } from "vitest"
import type { User } from "@prisma/client"

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id:                  "user-test-id",
    supabaseId:          null,
    name:                "Test User",
    email:               "test@example.com",
    password:            "$2b$12$hashedpassword",
    image:               null,
    role:                "USER",
    provider:            "credentials",
    googleId:            null,
    workspaceId:         "workspace-test-id",
    workspaceRole:       "OWNER",
    workspaceType:       null,
    teamSize:            null,
    primaryGoal:         null,
    onboardingCompleted: false,
    onboardingStep:      1,
    lastLogin:           new Date(),
    createdAt:           new Date(),
    updatedAt:           new Date(),
    ...overrides,
  }
}

export function mockUserRepository(user: Partial<User> | null = createMockUser()) {
  const { userRepository } = vi.mocked(
    await import("@/repositories/user.repository"),
  )
  const resolved = user ? createMockUser(user as Partial<User>) : null
  userRepository.findById     = vi.fn().mockResolvedValue(resolved)
  userRepository.findByEmail  = vi.fn().mockResolvedValue(resolved)
  userRepository.create       = vi.fn().mockResolvedValue(resolved)
  userRepository.update       = vi.fn().mockResolvedValue(resolved)
  return userRepository
}
