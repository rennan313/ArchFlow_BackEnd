import { prisma } from "@/lib/prisma"
import type { ProposalStatus } from "@prisma/client"

// CORE-3 (Sprint 0) — ProposalStatusHistory has no workspaceId field; scoped
// through the owning Proposal relation. `recordHistory` has no existing row
// to filter (an insert, not a query) — its workspace check happens one
// layer up (statusService already validates proposalRepository.findById(id,
// workspaceId) before ever calling this), matching the same reasoning as
// media.repository.ts#create.
export const statusRepository = {
  recordHistory(proposalId: string, oldStatus: ProposalStatus, newStatus: ProposalStatus) {
    return prisma.proposalStatusHistory.create({
      data: { proposalId, oldStatus, newStatus },
    })
  },

  getHistory(proposalId: string, workspaceId: string) {
    return prisma.proposalStatusHistory.findMany({
      where:   { proposalId, proposal: { workspaceId } },
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
