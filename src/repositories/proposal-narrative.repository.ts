import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ProposalNarrativeQueryInput } from "@/validations/proposal-narrative"

export const proposalNarrativeRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.proposalNarrative.findFirst({
      where: { id, OR: [{ workspaceId }, { workspaceId: null }] },
    })
  },

  async findMany(workspaceId: string, query: ProposalNarrativeQueryInput) {
    const { search, archived } = query

    const searchFilter: Prisma.ProposalNarrativeWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {}

    const [own, defaults] = await Promise.all([
      prisma.proposalNarrative.findMany({
        where: { workspaceId, archived: archived ?? false, ...searchFilter },
        orderBy: { createdAt: "desc" },
      }),
      prisma.proposalNarrative.findMany({
        where: { workspaceId: null, archived: false, ...searchFilter },
        orderBy: { createdAt: "desc" },
      }),
    ])

    const data = [...own, ...defaults]
    return { data, total: data.length }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.ProposalNarrativeUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.proposalNarrative.create({ data: { ...data, userId, workspaceId } })
  },

  update(id: string, workspaceId: string, data: Prisma.ProposalNarrativeUpdateInput) {
    return prisma.proposalNarrative.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.proposalNarrative.deleteMany({ where: { id, workspaceId } })
  },
}
