import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ProjectQueryInput } from "@/validations/project"

const clientSelect = { select: { id: true, name: true, company: true } } as const

export const projectRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.project.findFirst({
      where:   { id, workspaceId },
      include: { client: clientSelect },
    })
  },

  async findMany(workspaceId: string, query: ProjectQueryInput) {
    const { page, limit, search, status, type, clientId, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      ...(status   && { status }),
      ...(type     && { type }),
      ...(clientId && { clientId }),
      ...(search   && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { [sortBy]: sortOrder },
        include: { client: clientSelect },
      }),
      prisma.project.count({ where }),
    ])

    return { data, total }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.ProjectUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.project.create({
      data:    { ...data, userId, workspaceId },
      include: { client: clientSelect },
    })
  },

  update(id: string, workspaceId: string, data: Prisma.ProjectUpdateInput) {
    return prisma.project.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.project.deleteMany({ where: { id, workspaceId } })
  },
}
