import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { ProposalQueryInput } from "@/validations/proposal";

export const proposalRepository = {
  findById(id: string, userId: string) {
    return prisma.proposal.findFirst({ where: { id, userId } });
  },

  async findMany(userId: string, query: ProposalQueryInput) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProposalWhereInput = {
      userId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { clientName: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
          { projectType: { contains: search, mode: "insensitive" } },
          { style: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.proposal.count({ where }),
    ]);

    return { data, total };
  },

  create(data: Prisma.ProposalCreateInput) {
    return prisma.proposal.create({ data });
  },

  update(id: string, userId: string, data: Prisma.ProposalUpdateInput) {
    return prisma.proposal.updateMany({ where: { id, userId }, data });
  },

  delete(id: string, userId: string) {
    return prisma.proposal.deleteMany({ where: { id, userId } });
  },
};
