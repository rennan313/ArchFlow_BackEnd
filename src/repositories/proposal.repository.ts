import { prisma, type PrismaTransactionClient } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { ProposalQueryInput } from "@/validations/proposal";
import { toSkip } from "@/lib/pagination";

// Accepts either the global `prisma` singleton or a transaction client, so
// creation can run standalone or as part of a larger atomic transaction.
type Db = typeof prisma | PrismaTransactionClient;

export const proposalRepository = {
  findById(id: string, workspaceId: string) {
    return prisma.proposal.findFirst({ where: { id, workspaceId } });
  },

  async findMany(workspaceId: string, query: ProposalQueryInput) {
    const { page, limit, search, status, sortBy, sortOrder, archived } = query;
    const skip = toSkip(page, limit);

    const where: Prisma.ProposalWhereInput = {
      workspaceId,
      archived: archived ?? false,
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

  create(data: Prisma.ProposalCreateInput, db: Db = prisma) {
    return db.proposal.create({ data });
  },

  update(id: string, workspaceId: string, data: Prisma.ProposalUpdateInput) {
    return prisma.proposal.updateMany({ where: { id, workspaceId }, data });
  },

  /** Atomic compare-and-swap: flips builderStatus DRAFT -> BUILDING only if
   *  it is still DRAFT. Closes a TOCTOU race in
   *  proposalSectionInstanceService.initialize() where two near-simultaneous
   *  requests could both pass a "do section instances already exist?" check
   *  and both create snapshots. Returns true iff THIS call won the claim. */
  async claimForInitialize(id: string, workspaceId: string): Promise<boolean> {
    const result = await prisma.proposal.updateMany({
      where: { id, workspaceId, builderStatus: "DRAFT" },
      data:  { builderStatus: "BUILDING" },
    });
    return result.count === 1;
  },

  /** SENT proposals with no movement since `cutoff` — feeds the on-demand stale-proposal follow-up automation. */
  findStaleSent(workspaceId: string, cutoff: Date) {
    return prisma.proposal.findMany({
      where: {
        workspaceId,
        archived: false,
        status: "SENT",
        OR: [
          { statusUpdatedAt: { lt: cutoff } },
          { statusUpdatedAt: null, updatedAt: { lt: cutoff } },
        ],
      },
      select: { id: true, userId: true, opportunityId: true, clientId: true, clientName: true },
    });
  },
};
