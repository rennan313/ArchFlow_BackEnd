import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const brandingRepository = {
  findByWorkspace(workspaceId: string) {
    return prisma.officeBranding.findUnique({ where: { workspaceId } })
  },

  upsert(workspaceId: string, userId: string, data: Omit<Prisma.OfficeBrandingCreateInput, "user" | "workspace">) {
    return prisma.officeBranding.upsert({
      where:  { workspaceId },
      create: { ...data, user: { connect: { id: userId } }, workspace: { connect: { id: workspaceId } } },
      update: data,
    })
  },

  updateAsset(
    workspaceId: string,
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
      where:  { workspaceId },
      create: { ...fields, user: { connect: { id: userId } }, workspace: { connect: { id: workspaceId } } },
      update: fields,
    })
  },
}
