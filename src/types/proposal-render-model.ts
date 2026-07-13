// ─── Render Model layer ────────────────────────────────────────────────────
// The ONLY shape any exportable output (PDF today, DOCX/web-preview/share
// link later) is allowed to consume. Nothing downstream of RenderDocument
// may read ProposalSectionInstance or generatedProposalJson directly — see
// proposal-renderer.service.ts, which is the sole place that bridges DB
// rows into this shape.

export type ProposalSkinValue =
  | "EDITORIAL" | "MINIMAL" | "PREMIUM" | "CORPORATE" | "LUXURY"
  | "ENTERPRISE_LIGHT" | "ENTERPRISE_DARK" | "PREMIUM_GOLD" | "CORPORATE_EXECUTIVE"

export interface ThemeTokens {
  skin: ProposalSkinValue
  typography: {
    coverTitleSize: number
    sectionTitleSize: number
    bodySize: number
    fontFamily: string
  }
  colors: {
    background: string
    backgroundAlt: string
    text: string
    textMuted: string
    accent: string
  }
  spacing: {
    pageMargin: number
    sectionGap: number
  }
  coverLayout: "DARK_FULL_BLEED" | "LIGHT_MINIMAL" | "SPLIT"
  sectionSeparator: "NUMBERED" | "RULE" | "NONE"
  footerStyle: "BORDERED" | "PLAIN"
}

export interface RenderMetadata {
  proposalId: string
  generatedAt: string // ISO timestamp of this render call
  skin: ProposalSkinValue
  narrativeProfile: string | null
  code: string // short human-facing reference, e.g. "ARQ-0127"
}

export interface RenderCover {
  title: string
  subtitle: string
  clientName: string
  projectType: string
  location: string // city [+ ", " + state], pre-joined
  officeName: string | null
  architectName: string | null
  cauNumber: string | null
  createdAt: string
  /** Office logo — sourced fresh from branding at render time (Fase A). */
  logoUrl: string | null
  /** Cover hero image URL — resolved from the premium cover payload's
   *  heroMediaId against the signed-URL-refreshed media list. Null when the
   *  proposal has no premium cover or no hero image. */
  heroImageUrl: string | null
}

export interface RenderSection {
  id: string // ProposalSectionInstance.id — stable key for the PDF layer, nothing more
  order: number
  title: string
  content: string
  isEmpty: boolean
  /** Parsed premium-narrative payload (Fase A) — null for pre-premium
   *  instances or on any parse failure, which routes the section to the
   *  generic renderer exactly as before. Parsed ONCE here at the mapper
   *  boundary, never re-parsed downstream. */
  metadata: import("@/types/proposal-premium-narrative").PremiumNarrativeSectionPayload | null
}

export interface RenderFooter {
  officeName: string | null
  contact: string | null // pre-formatted email/phone, joined
  signatureLabelLeft: string // "Prestador de serviços" side
  signatureLabelRight: string // "Contratante" side
  code: string
}

export type RenderVisualRefType = "IMAGE" | "GIF" | "VIDEO" | "YOUTUBE" | "VIMEO"

export interface RenderVisualRef {
  id:        string
  type:      RenderVisualRefType
  url:       string
  thumbnail: string | null
  order:     number
}

export interface RenderDocument {
  schemaVersion: 1
  metadata:    RenderMetadata
  cover:       RenderCover
  sections:    RenderSection[]
  appendix:    RenderSection[]
  footer:      RenderFooter
  visualRefs:  RenderVisualRef[]
}

// ─── Snapshot layer (SnapshotLoader output, RenderModelMapper input) ──────

export interface OfficeBrandingSnapshot {
  officeName: string | null
  tradeName: string | null
  architectName: string | null
  cauNumber: string | null
  email: string | null
  phone: string | null
  logoUrl: string | null
  primaryColor: string | null
}

export interface ProposalSnapshot {
  proposal: {
    id: string
    clientName: string
    city: string | null
    state: string | null
    projectType: string
    builderSkin: ProposalSkinValue | null
    builderNarrativeProfile: string | null
    createdAt: Date
  }
  sections: Array<{
    id: string
    title: string
    content: string
    sortOrder: number
    /** Raw JSON string from ProposalSectionInstance.metadata — parsed by the mapper. */
    metadata: string | null
  }>
  branding: OfficeBrandingSnapshot | null
  media: Array<{
    id:          string
    type:        string
    url:         string
    storagePath: string | null
    thumbnail:   string | null
    order:       number
  }>
}

// ─── Error handling ─────────────────────────────────────────────────────────

export type RenderErrorCode =
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_EMPTY"        // no section instances AND no legacy content to migrate from
  | "UNSUPPORTED_SKIN"
  | "CORRUPTED_SNAPSHOT"

export class RenderError extends Error {
  constructor(public readonly code: RenderErrorCode, message?: string) {
    super(message ?? code)
    this.name = "RenderError"
  }
}
