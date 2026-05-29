import { prisma } from "@/lib/prisma"

export const proposalVersionRepository = {
  findAll(proposalId: string) {
    return prisma.proposalVersion.findMany({
      where:   { proposalId },
      orderBy: { version: "desc" },
    })
  },

  findOne(proposalId: string, version: number) {
    return prisma.proposalVersion.findFirst({ where: { proposalId, version } })
  },

  async create(proposalId: string, generatedContent: string) {
    const last = await prisma.proposalVersion.findFirst({
      where:   { proposalId },
      orderBy: { version: "desc" },
      select:  { version: true },
    })
    const nextVersion = (last?.version ?? 0) + 1
    return prisma.proposalVersion.create({
      data: { proposalId, version: nextVersion, generatedContent },
    })
  },
}
