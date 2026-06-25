import { proposalRepository } from "@/repositories/proposal.repository"
import { proposalSectionInstanceRepository } from "@/repositories/proposal-section-instance.repository"
import { brandingService } from "@/services/branding.service"
import { legacyMigrationService } from "@/services/render/legacy-migration.service"
import { RenderError } from "@/types/proposal-render-model"
import type { ProposalSnapshot, ProposalSkinValue } from "@/types/proposal-render-model"

// ─── Etapa 1/3 — the ONLY place that touches the database for rendering ────
// Returns a plain ProposalSnapshot DTO; everything downstream (mapper, theme
// engine, PDF adapter) is pure and DB-free. Triggers the Etapa 6 legacy
// migration transparently when a proposal has no section instances yet —
// callers never need to know whether a proposal predates the Editor.
export const snapshotLoaderService = {
  async load(proposalId: string, workspaceId: string): Promise<ProposalSnapshot> {
    const proposal = await proposalRepository.findById(proposalId, workspaceId)
    if (!proposal) throw new RenderError("PROPOSAL_NOT_FOUND")

    let instances = await proposalSectionInstanceRepository.findByProposal(proposalId, workspaceId)

    if (legacyMigrationService.needsMigration(proposal, instances.length)) {
      await legacyMigrationService.migrate(proposal, workspaceId)
      instances = await proposalSectionInstanceRepository.findByProposal(proposalId, workspaceId)
    }

    if (instances.length === 0) {
      throw new RenderError("PROPOSAL_EMPTY", "This proposal has no content to render yet")
    }

    const branding = await brandingService.getBrandingContext(workspaceId)

    return {
      proposal: {
        id:                      proposal.id,
        clientName:              proposal.clientName,
        city:                    proposal.city,
        state:                   proposal.state,
        projectType:             proposal.projectType,
        builderSkin:             (proposal.builderSkin as ProposalSkinValue | null) ?? null,
        builderNarrativeProfile: proposal.builderNarrativeProfile,
        createdAt:               proposal.createdAt,
      },
      sections: instances.map((i) => ({
        id:        i.id,
        title:     i.title,
        content:   i.content,
        sortOrder: i.sortOrder,
      })),
      branding: branding
        ? {
            officeName:    branding.officeName,
            tradeName:     branding.tradeName,
            architectName: branding.architectName,
            cauNumber:     branding.cauNumber,
            email:         branding.email,
            phone:         branding.phone,
            logoUrl:       branding.logoUrl,
            primaryColor:  branding.primaryColor,
          }
        : null,
    }
  },
}
