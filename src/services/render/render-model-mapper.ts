import { RenderError } from "@/types/proposal-render-model"
import type { ProposalSnapshot, RenderDocument, RenderSection } from "@/types/proposal-render-model"

// ─── Etapa 3 — pure transformation, zero I/O ───────────────────────────────
// ProposalSnapshot -> RenderDocument. Given a valid snapshot this function
// cannot fail — validation of "is this snapshot well-formed" belongs to the
// boundary (SnapshotLoader), not here. Order is taken directly from
// sortOrder, which Phase 1.5's hardening pass already guarantees is dense
// and gap-free for live proposals; migrated legacy proposals get a fresh
// 0..N sequence from legacyMigrationService. Either way this mapper just
// trusts it and sorts.

function proposalCode(id: string): string {
  const num = (parseInt(id.slice(-4), 16) % 9999) + 1
  return `ARQ-${String(num).padStart(4, "0")}`
}

function joinLocation(city: string | null, state: string | null): string {
  const cityPart = city?.split("—")[0]?.trim() ?? ""
  if (cityPart && state) return `${cityPart}, ${state}`
  return cityPart || state || "Não informado"
}

function joinContact(email: string | null, phone: string | null): string | null {
  const parts = [email, phone].filter(Boolean)
  return parts.length ? parts.join(" · ") : null
}

export function mapSnapshotToRenderDocument(snapshot: ProposalSnapshot): RenderDocument {
  const { proposal, sections: rawSections, branding } = snapshot

  if (!proposal.clientName?.trim()) {
    throw new RenderError("CORRUPTED_SNAPSHOT", "Proposal is missing client name")
  }

  const sections: RenderSection[] = [...rawSections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      id:      s.id,
      order:   s.sortOrder,
      title:   s.title?.trim() || "(Sem título)",
      content: s.content ?? "",
      isEmpty: !s.content || s.content.trim().length === 0,
    }))

  const officeName = branding?.tradeName ?? branding?.officeName ?? null
  const code = proposalCode(proposal.id)

  const doc: RenderDocument = {
    schemaVersion: 1,
    metadata: {
      proposalId:       proposal.id,
      generatedAt:      new Date().toISOString(),
      skin:             proposal.builderSkin ?? "MINIMAL",
      narrativeProfile: proposal.builderNarrativeProfile,
      code,
    },
    cover: {
      title:         `Proposta — ${proposal.clientName}`,
      subtitle:      `Projeto de ${proposal.projectType}`,
      clientName:    proposal.clientName,
      projectType:   proposal.projectType,
      location:      joinLocation(proposal.city, proposal.state),
      officeName,
      architectName: branding?.architectName ?? null,
      cauNumber:     branding?.cauNumber ?? null,
      createdAt:     proposal.createdAt.toISOString(),
    },
    sections,
    appendix: [], // nothing populates this yet — reserved per the Phase 2 architecture
    footer: {
      officeName,
      contact:             joinContact(branding?.email ?? null, branding?.phone ?? null),
      signatureLabelLeft:  "Prestador de serviços",
      signatureLabelRight: "Contratante",
      code,
    },
  }

  return doc
}
