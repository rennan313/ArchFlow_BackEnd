import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { MeetingQueryInput } from "@/validations/meeting"

const clientSelect = { select: { id: true, name: true, company: true } } as const

export const meetingRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.meeting.findFirst({
      where:   { id, workspaceId },
      include: { client: clientSelect },
    })
  },

  async findMany(workspaceId: string, query: MeetingQueryInput) {
    const { page, limit, clientId, projectId, status, type, from, to, sortBy, sortOrder } = query
    const skip = (page - 1) * limit

    const where: Prisma.MeetingWhereInput = {
      workspaceId,
      ...(clientId  && { clientId }),
      ...(projectId && { projectId }),
      ...(status    && { status }),
      ...(type      && { type }),
      ...((from || to) && {
        scheduledAt: {
          ...(from && { gte: from }),
          ...(to   && { lte: to }),
        },
      }),
    }

    const [data, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { [sortBy]: sortOrder },
        include: { client: clientSelect },
      }),
      prisma.meeting.count({ where }),
    ])

    return { data, total }
  },

  create(
    workspaceId: string,
    userId: string,
    data: Omit<Prisma.MeetingUncheckedCreateInput, "id" | "userId" | "workspaceId" | "createdAt" | "updatedAt">,
  ) {
    return prisma.meeting.create({
      data:    { ...data, userId, workspaceId },
      include: { client: clientSelect },
    })
  },

  update(id: string, workspaceId: string, data: Prisma.MeetingUncheckedUpdateInput) {
    return prisma.meeting.updateMany({
      where: { id, workspaceId },
      data,
    }).then(() => prisma.meeting.findFirst({ where: { id, workspaceId }, include: { client: clientSelect } }))
  },

  delete(id: string, workspaceId: string) {
    return prisma.meeting.deleteMany({ where: { id, workspaceId } })
  },
}
