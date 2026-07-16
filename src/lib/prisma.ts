import { PrismaClient } from "@prisma/client"
import { env } from "@/lib/env"
// Registers BigInt.prototype.toJSON as a side effect (see money.ts) —
// imported here, the earliest point any BigInt-typed query result can
// exist, so it's always active before a route ever tries to JSON-serialize
// one. Every route already goes through this module transitively.
import "@/lib/money/money"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev ? ["query", "error", "warn"] : ["error"],
  })

if (env.isDev) {
  globalForPrisma.prisma = prisma
}
