import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { DocumentQueryInput, CreateDocumentFolderInput } from "@/validations/document"

const VERSION_INCLUDE = { versions: { orderBy: { version: "desc" as const } } }

export const documentRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.document.findFirst({
      where: { id, workspaceId },
      include: VERSION_INCLUDE,
    })
  },

  async findMany(workspaceId: string, query: DocumentQueryInput) {
    const { page, limit, search, type, clientId, projectId, folderId, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.DocumentWhereInput = {
      workspaceId,
      ...(type      && { type }),
      ...(clientId  && { clientId }),
      ...(projectId && { projectId }),
      ...(folderId  && { folderId }),
      ...(search    && { name: { contains: search, mode: "insensitive" } }),
    }

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { [sortBy]: sortOrder },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      }),
      prisma.document.count({ where }),
    ])
    return { data, total }
  },

  listRecent(workspaceId: string, limit: number) {
    return prisma.document.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: "desc" },
      take:    limit,
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    })
  },

  create(
    workspaceId: string,
    userId: string,
    data: { name: string; type: Prisma.DocumentCreateInput["type"]; clientId?: string; projectId?: string; folderId?: string },
    version: { fileName: string; mimeType: string; size: number; url: string; storagePath: string },
  ) {
    return prisma.document.create({
      data: {
        ...data,
        userId,
        workspaceId,
        currentVersion: 1,
        versions: {
          create: { ...version, userId, version: 1 },
        },
      },
      include: VERSION_INCLUDE,
    })
  },

  async addVersion(
    documentId: string,
    userId: string,
    nextVersion: number,
    version: { fileName: string; mimeType: string; size: number; url: string; storagePath: string },
  ) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        currentVersion: nextVersion,
        versions: { create: { ...version, userId, version: nextVersion } },
      },
    })
    return prisma.document.findUnique({ where: { id: documentId }, include: VERSION_INCLUDE })
  },

  delete(id: string, workspaceId: string) {
    return prisma.document.deleteMany({ where: { id, workspaceId } })
  },

  findFolderById(id: string, workspaceId: string) {
    return prisma.documentFolder.findFirst({ where: { id, workspaceId } })
  },

  createFolder(workspaceId: string, userId: string, input: CreateDocumentFolderInput) {
    return prisma.documentFolder.create({
      data: { name: input.name, clientId: input.clientId, projectId: input.projectId, userId, workspaceId },
    })
  },

  findFolders(workspaceId: string, filter: { clientId?: string; projectId?: string }) {
    return prisma.documentFolder.findMany({
      where: { workspaceId, ...filter },
      orderBy: { name: "asc" },
    })
  },
}
