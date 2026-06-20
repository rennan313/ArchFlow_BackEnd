import { prisma } from "@/lib/prisma"
import type { ProposalStatus } from "@prisma/client"

export const statusRepository = {
  recordHistory(proposalId: string, oldStatus: ProposalStatus, newStatus: ProposalStatus) {
    return prisma.proposalStatusHistory.create({
      data: { proposalId, oldStatus, newStatus },
    })
  },

  getHistory(proposalId: string) {
    return prisma.proposalStatusHistory.findMany({
      where:   { proposalId },
      orderBy: { changedAt: "desc" },
    })
  },

  updateProposalStatus(proposalId: string, workspaceId: string, newStatus: ProposalStatus) {
    return prisma.proposal.updateMany({
      where: { id: proposalId, workspaceId },
      data:  { status: newStatus, statusUpdatedAt: new Date() },
    })
  },
}
