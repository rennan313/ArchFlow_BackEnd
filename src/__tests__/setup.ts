import { vi } from "vitest"

// Set required env vars before any module is loaded
process.env.DATABASE_URL               = "mongodb://localhost:27017/archflow_test"
process.env.JWT_SECRET                 = "test-jwt-secret-must-be-long-enough-32c"
process.env.JWT_REFRESH_SECRET         = "test-refresh-secret-must-be-long-32c"
process.env.JWT_EXPIRES_IN             = "7d"
process.env.JWT_REFRESH_EXPIRES_IN     = "30d"
process.env.SUPABASE_URL               = "https://test.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY  = "test-service-role-key"
process.env.ANTHROPIC_API_KEY          = "sk-ant-test-key"
process.env.SMTP_HOST                  = "localhost"
process.env.SMTP_USER                  = "test@test.com"
process.env.SMTP_PASS                  = "test-pass"
process.env.FRONTEND_URL               = "http://localhost:3001"
process.env.NODE_ENV                   = "test"

// Mock Prisma globally — tests use mocks, not a real DB
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique:        vi.fn(),
      findFirst:         vi.fn(),
      findMany:          vi.fn(),
      create:            vi.fn(),
      update:            vi.fn(),
      updateMany:        vi.fn(),
      delete:            vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    workspace: {
      create:     vi.fn(),
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      update:     vi.fn(),
    },
    workspaceInvite: {
      findUnique:  vi.fn(),
      create:      vi.fn(),
      update:      vi.fn(),
      deleteMany:  vi.fn(),
    },
    resetPasswordToken: {
      create:      vi.fn(),
      findFirst:   vi.fn(),
      update:      vi.fn(),
      deleteMany:  vi.fn(),
    },
    proposal: {
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
      delete:     vi.fn(),
      deleteMany: vi.fn(),
      count:      vi.fn(),
    },
  },
}))

// Mock repository layer
vi.mock("@/repositories/user.repository", () => ({
  userRepository: {
    findById:     vi.fn(),
    findByEmail:  vi.fn(),
    create:       vi.fn(),
    update:       vi.fn(),
  },
}))

vi.mock("@/repositories/resetToken.repository", () => ({
  resetTokenRepository: {
    create:         vi.fn(),
    findByToken:    vi.fn(),
    markUsed:       vi.fn(),
    deleteByUserId: vi.fn(),
  },
}))

vi.mock("@/repositories/proposal.repository", () => ({
  proposalRepository: {
    findById: vi.fn(),
    findMany: vi.fn(),
    create:   vi.fn(),
    update:   vi.fn(),
    delete:   vi.fn(),
  },
}))

vi.mock("@/lib/pagination", () => ({
  buildMeta: vi.fn(),
}))
