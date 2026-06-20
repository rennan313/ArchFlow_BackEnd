import { meetingRepository } from "@/repositories/meeting.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import type { CreateMeetingInput, UpdateMeetingInput, MeetingQueryInput } from "@/validations/meeting"

export const meetingService = {
  async list(workspaceId: string, query: MeetingQueryInput) {
    const { data, total } = await meetingRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const meeting = await meetingRepository.findById(id, workspaceId)
    if (!meeting) throw new AppError(ErrorCode.MEETING_NOT_FOUND)
    return meeting
  },

  async create(workspaceId: string, userId: string, input: CreateMeetingInput) {
    return meetingRepository.create(workspaceId, userId, {
      clientId:    input.clientId,
      title:       input.title,
      type:        input.type,
      status:      input.status ?? "SCHEDULED",
      scheduledAt: input.scheduledAt,
      duration:    input.duration,
      location:    input.location,
      objectives:  input.objectives,
      notes:       input.notes,
      decisions:   input.decisions,
      nextSteps:   input.nextSteps,
      summary:     input.summary,
      projectId:   input.projectId,
      proposalId:  input.proposalId,
    })
  },

  async update(id: string, workspaceId: string, input: UpdateMeetingInput) {
    await this.getById(id, workspaceId)
    return meetingRepository.update(id, workspaceId, {
      ...(input.title       !== undefined && { title:       input.title }),
      ...(input.type        !== undefined && { type:        input.type }),
      ...(input.status      !== undefined && { status:      input.status }),
      ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt }),
      ...(input.duration    !== undefined && { duration:    input.duration }),
      ...(input.location    !== undefined && { location:    input.location }),
      ...(input.objectives  !== undefined && { objectives:  input.objectives }),
      ...(input.notes       !== undefined && { notes:       input.notes }),
      ...(input.decisions   !== undefined && { decisions:   input.decisions }),
      ...(input.nextSteps   !== undefined && { nextSteps:   input.nextSteps }),
      ...(input.summary     !== undefined && { summary:     input.summary }),
      ...(input.projectId   !== undefined && { projectId:   input.projectId }),
      ...(input.proposalId  !== undefined && { proposalId:  input.proposalId }),
    })
  },

  async delete(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    await meetingRepository.delete(id, workspaceId)
  },
}
