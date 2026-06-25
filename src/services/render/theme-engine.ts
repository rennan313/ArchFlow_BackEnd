import { RenderError } from "@/types/proposal-render-model"
import type { ProposalSkinValue, ThemeTokens } from "@/types/proposal-render-model"

// ─── Etapa 4 (Fase 2.0) / Fase 2.1 design pass — Theme Engine ──────────────
// Pure lookup table: skin -> visual tokens. The PDF layer requests tokens
// from here and never hardcodes a color/font/spacing value itself.
//
// Fase 2.1 audit finding: the original 5 skins included one outright
// violation of the "no saturated/neon colors" rule (EDITORIAL's accent was
// #7c3aed, a vivid violet) and one borderline case (CORPORATE's #1e3a8a, a
// fairly generic "SaaS blue"). Both are replaced below with the same
// restrained, warm-neutral + muted-accent palette used by the 4 new
// enterprise-named skins, so EVERY possible skin value now reads as an
// architecture-office document rather than a software product. Nothing
// downstream of this file changed: ProposalAdvisorService still emits one of
// the original 5 names (preserving ProposalTemplate.skin matching), but the
// tokens those names now resolve to are enterprise-appropriate.

// Shared neutral palette — no pure black/white extremes, no saturated hues.
const PAPER       = "#FFFFFF" // body page background
const PAPER_WARM  = "#FAF8F4" // off-white, used for light covers / alt sections
const INK         = "#1C1B19" // soft black — primary text, never pure #000
const INK_SOFT    = "#4A4742" // secondary text
const GRAY_MUTED  = "#8C8980" // labels, captions, muted body
const HAIRLINE    = "#E3DFD6" // dividers on light backgrounds
const NEAR_BLACK  = "#15140F" // dark cover/section background — warm, not cold #09090b

// Accent palette — the only permitted "color" per surface, used sparingly.
const GOLD      = "#9C7A3C"
const BRONZE    = "#8A6A42"
const GRAPHITE  = "#4A4742"
const PETROLEUM = "#28484C"
const DEEP_GREEN = "#2E4034"

const BASE_TYPOGRAPHY = { coverTitleSize: 28, sectionTitleSize: 21, bodySize: 10, fontFamily: "Inter" }
const BASE_SPACING     = { pageMargin: 56, sectionGap: 22 }

const THEMES: Record<ProposalSkinValue, ThemeTokens> = {
  // ── Original 5 — kept for ProposalTemplate/advisor compatibility, tokens redesigned ──
  EDITORIAL: {
    skin: "EDITORIAL",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: NEAR_BLACK, text: INK, textMuted: GRAY_MUTED, accent: GRAPHITE },
    spacing: BASE_SPACING,
    coverLayout: "DARK_FULL_BLEED",
    sectionSeparator: "NUMBERED",
    footerStyle: "BORDERED",
  },
  MINIMAL: {
    skin: "MINIMAL",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: PAPER_WARM, text: INK, textMuted: GRAY_MUTED, accent: GRAPHITE },
    spacing: BASE_SPACING,
    coverLayout: "LIGHT_MINIMAL",
    sectionSeparator: "RULE",
    footerStyle: "PLAIN",
  },
  PREMIUM: {
    skin: "PREMIUM",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: NEAR_BLACK, text: INK, textMuted: GRAY_MUTED, accent: GOLD },
    spacing: BASE_SPACING,
    coverLayout: "DARK_FULL_BLEED",
    sectionSeparator: "NUMBERED",
    footerStyle: "BORDERED",
  },
  CORPORATE: {
    skin: "CORPORATE",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: PAPER_WARM, text: INK, textMuted: GRAY_MUTED, accent: PETROLEUM },
    spacing: BASE_SPACING,
    coverLayout: "SPLIT",
    sectionSeparator: "RULE",
    footerStyle: "PLAIN",
  },
  LUXURY: {
    skin: "LUXURY",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: NEAR_BLACK, text: INK, textMuted: GRAY_MUTED, accent: BRONZE },
    spacing: BASE_SPACING,
    coverLayout: "DARK_FULL_BLEED",
    sectionSeparator: "NONE",
    footerStyle: "BORDERED",
  },

  // ── Fase 2.1 — new, explicitly enterprise-named skins ──────────────────
  ENTERPRISE_LIGHT: {
    skin: "ENTERPRISE_LIGHT",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: PAPER_WARM, text: INK, textMuted: GRAY_MUTED, accent: GRAPHITE },
    spacing: BASE_SPACING,
    coverLayout: "LIGHT_MINIMAL",
    sectionSeparator: "RULE",
    footerStyle: "PLAIN",
  },
  ENTERPRISE_DARK: {
    skin: "ENTERPRISE_DARK",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: NEAR_BLACK, text: INK, textMuted: GRAY_MUTED, accent: PETROLEUM },
    spacing: BASE_SPACING,
    coverLayout: "DARK_FULL_BLEED",
    sectionSeparator: "NUMBERED",
    footerStyle: "BORDERED",
  },
  PREMIUM_GOLD: {
    skin: "PREMIUM_GOLD",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: NEAR_BLACK, text: INK, textMuted: GRAY_MUTED, accent: GOLD },
    spacing: BASE_SPACING,
    coverLayout: "DARK_FULL_BLEED",
    sectionSeparator: "NUMBERED",
    footerStyle: "BORDERED",
  },
  CORPORATE_EXECUTIVE: {
    skin: "CORPORATE_EXECUTIVE",
    typography: BASE_TYPOGRAPHY,
    colors: { background: PAPER, backgroundAlt: PAPER_WARM, text: INK, textMuted: GRAY_MUTED, accent: DEEP_GREEN },
    spacing: BASE_SPACING,
    coverLayout: "SPLIT",
    sectionSeparator: "RULE",
    footerStyle: "PLAIN",
  },
}

export const themeEngine = {
  resolve(skin: ProposalSkinValue): ThemeTokens {
    const tokens = THEMES[skin]
    if (!tokens) throw new RenderError("UNSUPPORTED_SKIN", `No theme registered for skin "${skin}"`)
    return tokens
  },
}

export { PAPER, PAPER_WARM, INK, INK_SOFT, GRAY_MUTED, HAIRLINE, NEAR_BLACK }
