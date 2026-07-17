import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ProposalTemplateQueryInput } from "@/validations/proposal-template"

export const proposalTemplateRepository = {
  // Reads accept either the caller's own workspace row or a platform-default
  // (workspaceId: null) row — so a default template can be opened/previewed
  // the same way a workspace's own template can.
  findById(id: string, workspaceId: string) {
    return prisma.proposalTemplate.findFirst({
      where: { id, OR: [{ workspaceId }, { workspaceId: null }] },
    })
  },

  async findMany(workspaceId: string, query: ProposalTemplateQueryInput) {
    const { search, archived } = query

    const searchFilter: Prisma.ProposalTemplateWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {}

    const [own, defaults] = await Promise.all([
      prisma.proposalTemplate.findMany({
        where: { workspaceId, archived: archived ?? false, ...searchFilter },
        orderBy: { createdAt: "desc" },
      }),
      prisma.proposalTemplate.findMany({
        where: { workspaceId: null, archived: false, ...searchFilter },
        orderBy: { createdAt: "desc" },
      }),
    ])

    const data  = [...own, ...defaults]
    const total = data.length
    return { data, total }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.ProposalTemplateUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.proposalTemplate.create({ data: { ...data, userId, workspaceId } })
  },

  update(id: string, workspaceId: string, data: Prisma.ProposalTemplateUpdateInput) {
    return prisma.proposalTemplate.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.proposalTemplate.deleteMany({ where: { id, workspaceId } })
  },
}
