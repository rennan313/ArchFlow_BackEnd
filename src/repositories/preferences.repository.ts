import { prisma } from "@/lib/prisma"

export const preferencesRepository = {
  findByUserId(userId: string) {
    return prisma.userPreferences.findUnique({ where: { userId } })
  },

  upsert(userId: string, data: { preferredLanguage?: string; preferredTheme?: string }) {
    return prisma.userPreferences.upsert({
      where:  { userId },
      create: { userId, ...data },
      update: data,
    })
  },
}
