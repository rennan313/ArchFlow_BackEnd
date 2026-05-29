import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const brandingRepository = {
  findByUser(userId: string) {
    return prisma.officeBranding.findUnique({ where: { userId } })
  },

  upsert(userId: string, data: Omit<Prisma.OfficeBrandingCreateInput, "user">) {
    return prisma.officeBranding.upsert({
      where:  { userId },
      create: { ...data, user: { connect: { id: userId } } },
      update: data,
    })
  },

  updateAsset(
    userId: string,
    fields: Partial<{
      logoUrl:              string
      logoStoragePath:      string
      logoWhiteUrl:         string
      logoWhiteStoragePath: string
      faviconUrl:           string
      faviconStoragePath:   string
    }>,
  ) {
    return prisma.officeBranding.upsert({
      where:  { userId },
      create: { ...fields, user: { connect: { id: userId } } },
      update: fields,
    })
  },
}
