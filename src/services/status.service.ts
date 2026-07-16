import { proposalRepository } from "@/repositories/proposal.repository"
import { statusRepository } from "@/repositories/status.repository"
import { isValidTransition, getAllowedTransitions, STATUS_LABELS } from "@/validations/status"
import { AppError, ErrorCode } from "@/lib/errors"
import type { UpdateStatusInput } from "@/validations/status"
import type { ProposalStatus } from "@prisma/client"

export const statusService = {
  async update(proposalId: string, workspaceId: string, input: UpdateStatusInput) {
    const proposal = await proposalRepository.findById(proposalId, workspaceId)
    if (!proposal) throw new AppError(ErrorCode.NOT_FOUND)

    const currentStatus = proposal.status as ProposalStatus
    const newStatus     = input.status as ProposalStatus

    if (currentStatus === newStatus) {
      return { proposal, changed: false, message: "Status is already set to this value" }
    }

    if (!input.force && !isValidTransition(currentStatus, newStatus)) {
      throw new Error(
        `INVALID_TRANSITION:${currentStatus}:${newStatus}:${getAllowedTransitions(currentStatus).join(",")}`,
      )
    }

    await statusRepository.updateProposalStatus(proposalId, workspaceId, newStatus)
    await statusRepository.recordHistory(proposalId, currentStatus, newStatus)

    const updated = await proposalRepository.findById(proposalId, workspaceId)

    return {
      proposal: updated,
      changed:  true,
      message:  `Status updated to "${STATUS_LABELS[newStatus]}"`,
      from:     STATUS_LABELS[currentStatus],
      to:       STATUS_LABELS[newStatus],
    }
  },

  async getHistory(proposalId: string, workspaceId: string) {
    const proposal = await proposalRepository.findById(proposalId, workspaceId)
    if (!proposal) throw new AppError(ErrorCode.NOT_FOUND)

    const history = await statusRepository.getHistory(proposalId, workspaceId)

    return history.map((h) => ({
      id:        h.id,
      oldStatus: h.oldStatus,
      newStatus: h.newStatus,
      oldLabel:  STATUS_LABELS[h.oldStatus],
      newLabel:  STATUS_LABELS[h.newStatus],
      changedAt: h.changedAt,
    }))
  },
}
