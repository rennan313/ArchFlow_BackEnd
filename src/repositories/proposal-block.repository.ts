import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ProposalBlockQueryInput } from "@/validations/proposal-block"

export const proposalBlockRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.proposalBlock.findFirst({
      where: { id, OR: [{ workspaceId }, { workspaceId: null }] },
    })
  },

  async findMany(workspaceId: string, query: ProposalBlockQueryInput) {
    const { search, sectionKey, isArchived, isFavorite } = query

    const sharedFilter: Prisma.ProposalBlockWhereInput = {
      ...(sectionKey && { sectionKey }),
      ...(search && { name: { contains: search, mode: "insensitive" } }),
      ...(isFavorite !== undefined && { isFavorite }),
    }

    // Block variants are a catalog of choices, not slots — unlike sections,
    // a workspace's own block never hides a platform-default variant for the
    // same section, both are valid picker options.
    const [own, defaults] = await Promise.all([
      prisma.proposalBlock.findMany({
        where: { workspaceId, isArchived: isArchived ?? false, ...sharedFilter },
        orderBy: { createdAt: "desc" },
      }),
      prisma.proposalBlock.findMany({
        where: { workspaceId: null, isArchived: false, sharedInWorkspace: true, ...sharedFilter },
        orderBy: { createdAt: "desc" },
      }),
    ])

    const data = [...own, ...defaults]
    return { data, total: data.length }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.ProposalBlockUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.proposalBlock.create({ data: { ...data, userId, workspaceId } })
  },

  update(id: string, workspaceId: string, data: Prisma.ProposalBlockUpdateInput) {
    return prisma.proposalBlock.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.proposalBlock.deleteMany({ where: { id, workspaceId } })
  },
}
