import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const mediaRepository = {
  findAll(proposalId: string) {
    return prisma.proposalMedia.findMany({
      where:   { proposalId },
      orderBy: { order: "asc" },
    })
  },

  findById(mediaId: string, proposalId: string) {
    return prisma.proposalMedia.findFirst({
      where: { id: mediaId, proposalId },
    })
  },

  create(data: Prisma.ProposalMediaCreateInput) {
    return prisma.proposalMedia.create({ data })
  },

  update(mediaId: string, proposalId: string, data: Prisma.ProposalMediaUpdateInput) {
    return prisma.proposalMedia.updateMany({
      where: { id: mediaId, proposalId },
      data,
    })
  },

  delete(mediaId: string, proposalId: string) {
    return prisma.proposalMedia.deleteMany({
      where: { id: mediaId, proposalId },
    })
  },

  async reorder(proposalId: string, items: { mediaId: string; order: number }[]) {
    await prisma.$transaction(
      items.map(({ mediaId, order }) =>
        prisma.proposalMedia.updateMany({
          where: { id: mediaId, proposalId },
          data:  { order },
        }),
      ),
    )
  },

  countByProposal(proposalId: string) {
    return prisma.proposalMedia.count({ where: { proposalId } })
  },
}
