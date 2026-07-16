import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

// CORE-3 (Sprint 0) — Briefing has no workspaceId field of its own; scoped
// through the owning Opportunity relation instead. `findUnique`/`upsert`
// require a unique-only `where` (Prisma/Mongo constraint, same limitation
// documented in document.repository.ts#addVersion), so they can't embed a
// relation filter directly — `findByOpportunity` uses `findFirst` instead
// (behaves identically to findUnique here, since opportunityId is unique,
// but supports the relation filter), and `upsert` pre-checks the parent
// Opportunity belongs to the workspace before creating/updating under it.
export const briefingRepository = {
  findByOpportunity(opportunityId: string, workspaceId: string) {
    return prisma.briefing.findFirst({ where: { opportunityId, opportunity: { workspaceId } } })
  },

  async upsert(opportunityId: string, workspaceId: string, data: Omit<Prisma.BriefingCreateInput, "opportunity">) {
    const owned = await prisma.opportunity.findFirst({ where: { id: opportunityId, workspaceId }, select: { id: true } })
    if (!owned) return null

    return prisma.briefing.upsert({
      where:  { opportunityId },
      create: { ...data, opportunity: { connect: { id: opportunityId } } },
      update: data,
    })
  },

  delete(opportunityId: string, workspaceId: string) {
    return prisma.briefing.deleteMany({ where: { opportunityId, opportunity: { workspaceId } } })
  },
}
