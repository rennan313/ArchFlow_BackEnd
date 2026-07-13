import { proposalRepository } from "@/repositories/proposal.repository"
import { proposalSectionInstanceRepository } from "@/repositories/proposal-section-instance.repository"
import { mediaRepository } from "@/repositories/media.repository"
import { brandingService } from "@/services/branding.service"
import { storageService } from "@/services/storage/supabase.service"
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

    // brandingService.get() (not getBrandingContext) — it refreshes signed
    // asset URLs, which matters now that the PDF cover renders the logo.
    const [branding, rawMedia] = await Promise.all([
      brandingService.get(workspaceId),
      mediaRepository.findAll(proposalId),
    ])

    // Refresh signed URLs for Supabase-stored files
    let media = rawMedia
    const withStorage = rawMedia.filter((m) => m.storagePath)
    if (withStorage.length > 0) {
      const refreshed = await storageService.refreshSignedUrls(
        withStorage.map((m) => ({ id: m.id, storagePath: m.storagePath, url: m.url })),
      ).catch(() => [] as { id: string; url: string }[])
      const urlMap = new Map(refreshed.map((r) => [r.id, r.url]))
      media = rawMedia.map((m) => ({ ...m, url: urlMap.get(m.id) ?? m.url }))
    }

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
        metadata:  i.metadata,
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
      media: media.map((m) => ({
        id:          m.id,
        type:        m.type as string,
        url:         m.url,
        storagePath: m.storagePath,
        thumbnail:   m.thumbnail,
        order:       m.order,
      })),
    }
  },
}
