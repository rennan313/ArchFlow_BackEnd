import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const proposalSectionInstanceRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.proposalSectionInstance.findFirst({ where: { id, workspaceId } })
  },

  findByProposal(proposalId: string, workspaceId: string) {
    return prisma.proposalSectionInstance.findMany({
      where:   { proposalId, workspaceId },
      orderBy: { sortOrder: "asc" },
    })
  },

  create(
    workspaceId: string,
    data: Omit<Prisma.ProposalSectionInstanceUncheckedCreateInput, "id" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.proposalSectionInstance.create({ data: { ...data, workspaceId } })
  },

  update(id: string, workspaceId: string, data: Prisma.ProposalSectionInstanceUpdateInput) {
    return prisma.proposalSectionInstance.updateMany({ where: { id, workspaceId }, data })
  },

  delete(id: string, workspaceId: string) {
    return prisma.proposalSectionInstance.deleteMany({ where: { id, workspaceId } })
  },

  deleteAllForProposal(proposalId: string, workspaceId: string) {
    return prisma.proposalSectionInstance.deleteMany({ where: { proposalId, workspaceId } })
  },

  /** Applies array-index sortOrder in one pass. Caller must have already
   *  verified `order` is exactly the set of instance ids for this proposal. */
  async applyOrder(order: string[], proposalId: string, workspaceId: string) {
    await Promise.all(
      order.map((id, index) =>
        prisma.proposalSectionInstance.updateMany({
          where: { id, proposalId, workspaceId },
          data:  { sortOrder: index },
        }),
      ),
    )
  },
}
