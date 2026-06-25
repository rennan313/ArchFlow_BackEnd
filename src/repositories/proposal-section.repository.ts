import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ProposalSectionQueryInput } from "@/validations/proposal-section"

export const proposalSectionRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.proposalSection.findFirst({
      where: { id, OR: [{ workspaceId }, { workspaceId: null }] },
    })
  },

  async findMany(workspaceId: string, query: ProposalSectionQueryInput) {
    const { search, isArchived } = query

    const searchFilter: Prisma.ProposalSectionWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {}

    const [own, defaults] = await Promise.all([
      prisma.proposalSection.findMany({
        where: { workspaceId, isArchived: isArchived ?? false, ...searchFilter },
        orderBy: { order: "asc" },
      }),
      prisma.proposalSection.findMany({
        where: { workspaceId: null, isArchived: false, ...searchFilter },
        orderBy: { order: "asc" },
      }),
    ])

    // A workspace's own section overrides the platform default for the same
    // `key` — the builder's section picker shouldn't show two "Resumo
    // Executivo" slots when the workspace has customized that slot.
    const ownKeys = new Set(own.map((s) => s.key))
    const data    = [...own, ...defaults.filter((s) => !ownKeys.has(s.key))]
    return { data, total: data.length }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.ProposalSectionUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.proposalSection.create({ data: { ...data, userId, workspaceId } })
  },

  update(id: string, workspaceId: string, data: Prisma.ProposalSectionUpdateInput) {
    return prisma.proposalSection.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.proposalSection.deleteMany({ where: { id, workspaceId } })
  },
}
