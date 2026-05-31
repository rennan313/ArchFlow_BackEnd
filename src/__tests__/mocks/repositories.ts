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
