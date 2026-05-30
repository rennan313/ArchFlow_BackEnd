import { PrismaClient } from "@prisma/client"
import { env } from "@/lib/env"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev ? ["query", "error", "warn"] : ["error"],
  })

if (!env.isDev) {
  globalForPrisma.prisma = prisma
}
