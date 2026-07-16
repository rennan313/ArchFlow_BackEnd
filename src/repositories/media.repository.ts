import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

// CORE-3 (Sprint 0) — ProposalMedia has no workspaceId field of its own
// (unlike Financial's models — ADR-006 assumes a direct scalar field, which
// doesn't exist here), so "workspaceId in the query itself" means filtering
// through the owning Proposal relation (`proposal: { workspaceId }`)
// instead. Every read/updateMany/deleteMany below does this — the same
// defense-in-depth goal as the Financial module, adapted to a model that
// predates that convention. `create()` has no existing row to scope a
// filter against; the workspace check for a create happens by validating
// proposalId belongs to the caller's workspace one layer up
// (proposalService.getById), same as before.
export const mediaRepository = {
  findAll(proposalId: string, workspaceId: string) {
    return prisma.proposalMedia.findMany({
      where:   { proposalId, proposal: { workspaceId } },
      orderBy: { order: "asc" },
    })
  },

  findById(mediaId: string, proposalId: string, workspaceId: string) {
    return prisma.proposalMedia.findFirst({
      where: { id: mediaId, proposalId, proposal: { workspaceId } },
    })
  },

  create(data: Prisma.ProposalMediaCreateInput) {
    return prisma.proposalMedia.create({ data })
  },

  update(mediaId: string, proposalId: string, workspaceId: string, data: Prisma.ProposalMediaUpdateInput) {
    return prisma.proposalMedia.updateMany({
      where: { id: mediaId, proposalId, proposal: { workspaceId } },
      data,
    })
  },

  delete(mediaId: string, proposalId: string, workspaceId: string) {
    return prisma.proposalMedia.deleteMany({
      where: { id: mediaId, proposalId, proposal: { workspaceId } },
    })
  },

  async reorder(proposalId: string, workspaceId: string, items: { mediaId: string; order: number }[]) {
    await prisma.$transaction(
      items.map(({ mediaId, order }) =>
        prisma.proposalMedia.updateMany({
          where: { id: mediaId, proposalId, proposal: { workspaceId } },
          data:  { order },
        }),
      ),
    )
  },

  countByProposal(proposalId: string, workspaceId: string) {
    return prisma.proposalMedia.count({ where: { proposalId, proposal: { workspaceId } } })
  },
}
