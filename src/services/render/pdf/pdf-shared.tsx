import React from "react"
import path from "path"
import { Text, View, StyleSheet, Font } from "@react-pdf/renderer"
import type { ThemeTokens } from "@/types/proposal-render-model"

// Shared PDF primitives — extracted from RenderDocumentPdf.tsx (Fase A) so
// the typed premium-narrative section components reuse the exact same fonts,
// style factory and footer instead of re-deriving them.

const FONTS_DIR = path.join(process.cwd(), "src/assets/fonts/inter")
let fontsRegistered = false
export function ensureFonts() {
  if (fontsRegistered) return
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONTS_DIR, "Inter-Regular.ttf"),  fontWeight: 400 },
      { src: path.join(FONTS_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONTS_DIR, "Inter-Bold.ttf"),     fontWeight: 700 },
      { src: path.join(FONTS_DIR, "Inter-Black.ttf"),    fontWeight: 900 },
    ],
  })
  // Never break a word across lines (default hyphenation produced
  // "An-\ndrade" for "Andrade"). Treat every word as a single unbreakable unit.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

export function buildStyles(theme: ThemeTokens) {
  const { colors, typography, spacing } = theme
  return StyleSheet.create({
    pageLight: { fontFamily: typography.fontFamily, backgroundColor: colors.background, padding: spacing.pageMargin, paddingBottom: 84 },
    pageDark:  { fontFamily: typography.fontFamily, backgroundColor: colors.backgroundAlt, padding: spacing.pageMargin, paddingBottom: 84 },
    // Cover pages render full-bleed — the cover components manage their own
    // internal padding. Reusing pageLight/pageDark here (as an earlier pass
    // did) framed the cover in an unintended margin "card" effect, most
    // visible on the SPLIT layout. Background is set per-layout since the
    // cover may be a different color than either body-page background.
    pageCover: { fontFamily: typography.fontFamily, padding: 0 },

    // Cover — shared
    coverTitle:    { fontSize: typography.coverTitleSize, fontWeight: 700, lineHeight: 1.25, marginBottom: 14, maxWidth: 480 },
    coverSubtitle: { fontSize: 12, lineHeight: 1.7, maxWidth: 420, marginBottom: 36 },
    coverEyebrow:  { fontSize: 8, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 18 },
    coverRule:     { width: 36, height: 1, marginBottom: 18 },

    // Cover — DARK_FULL_BLEED / dark-cover skins
    coverDark:        { flex: 1, padding: spacing.pageMargin, justifyContent: "space-between", backgroundColor: colors.backgroundAlt },
    coverDarkTitle:   { color: "#F5F3EE" },
    coverDarkSubtitle: { color: "#A8A39A" },
    coverDarkEyebrow: { color: colors.accent },
    coverDarkOffice:  { fontSize: 11, fontWeight: 600, color: "#F5F3EE" },
    coverDarkMuted:   { fontSize: 8, color: "#7A766C" },

    // Cover — LIGHT_MINIMAL
    coverLight:        { flex: 1, padding: spacing.pageMargin, justifyContent: "space-between", backgroundColor: colors.background },
    coverLightTitle:   { color: colors.text },
    coverLightSubtitle: { color: colors.textMuted },
    coverLightEyebrow: { color: colors.accent },
    coverLightOffice:  { fontSize: 11, fontWeight: 600, color: colors.text },
    coverLightMuted:   { fontSize: 8, color: colors.textMuted },
    coverLightTopRule: { borderTopWidth: 1, borderTopColor: "#E3DFD6" },

    // Cover — SPLIT (two columns: dark identity panel + light content panel)
    coverSplit:       { flex: 1, flexDirection: "row" },
    // Always a dark identity panel, regardless of what backgroundAlt means
    // for this skin's body-section alternation — SPLIT's panel is a
    // deliberate contrast device, not derived from the alternation color
    // (fixed a real bug: CORPORATE/CORPORATE_EXECUTIVE's backgroundAlt is a
    // light warm tone, which made the white-on-panel text unreadable).
    coverSplitPanel:  { width: "34%", backgroundColor: "#1C1B19", padding: 32, justifyContent: "space-between" },
    coverSplitMain:   { flex: 1, padding: spacing.pageMargin, justifyContent: "center", backgroundColor: colors.background },
    coverSplitPanelLabel: { fontSize: 7, color: "#A8A39A", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 },
    coverSplitPanelValue: { fontSize: 10, color: "#F5F3EE", fontWeight: 600, marginBottom: 16 },

    // Meta row — explicit fixed-width columns with real gutters
    metaRow:   { flexDirection: "row", marginTop: 28, paddingTop: 20 },
    metaCol:   { width: "25%", paddingRight: 12 },
    metaLabel: { fontSize: 7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 },
    metaValue: { fontSize: 10, fontWeight: 600 },

    // Section pages
    sectionLabel:      { fontSize: 7, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 14, color: colors.textMuted },
    sectionTitleLight: { fontSize: typography.sectionTitleSize, fontWeight: 700, lineHeight: 1.3, marginBottom: 8, color: colors.text },
    sectionTitleDark:  { fontSize: typography.sectionTitleSize, fontWeight: 700, lineHeight: 1.3, marginBottom: 8, color: "#F5F3EE" },
    sectionRule:       { width: 28, height: 1, backgroundColor: colors.accent, marginBottom: spacing.sectionGap },
    bodyTextLight: { fontSize: typography.bodySize, color: colors.textMuted, lineHeight: 1.9, marginBottom: 13 },
    bodyTextDark:  { fontSize: typography.bodySize, color: "#A8A39A", lineHeight: 1.9, marginBottom: 13 },
    emptyHint:     { fontSize: typography.bodySize, color: colors.textMuted, fontStyle: "italic" },

    // Content-aware list/ledger rendering
    listRow:      { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 1 },
    listRowLight: { borderBottomColor: "#E3DFD6" },
    listRowDark:  { borderBottomColor: "#2A2924" },
    listMarker:   { width: 16, fontSize: typography.bodySize, color: colors.accent, fontWeight: 600 },
    listText:     { flex: 1, fontSize: typography.bodySize, lineHeight: 1.6 },

    footer: { position: "absolute", bottom: 28, left: spacing.pageMargin, right: spacing.pageMargin, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    footerLine: { borderTopWidth: 1, borderTopColor: "#2A2924", marginBottom: 10 },
    footerLineLight: { borderTopWidth: 1, borderTopColor: "#E3DFD6", marginBottom: 10 },
    footerText: { fontSize: 7, letterSpacing: 0.5 },

    signatureBlock: { flex: 1, borderBottomWidth: 1, borderBottomColor: "#C9C4B8", paddingBottom: 10 },
    signatureLabel: { fontSize: 7, color: colors.textMuted, flex: 1, textAlign: "center", letterSpacing: 1, textTransform: "uppercase" },
  })
}

export type PdfStyles = ReturnType<typeof buildStyles>

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

export function Footer({ label, page, dark, styles }: { label: string; page: number; dark: boolean; styles: PdfStyles }) {
  return (
    <View style={styles.footer}>
      <View style={{ flex: 1 }}>
        <View style={dark ? styles.footerLine : styles.footerLineLight} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[styles.footerText, { color: dark ? "#6B675E" : "#A39E92" }]}>{label}</Text>
          <Text style={[styles.footerText, { color: dark ? "#6B675E" : "#A39E92" }]}>{page}</Text>
        </View>
      </View>
    </View>
  )
}

/** Shared props for every typed premium-narrative PDF section page. */
export interface TypedSectionPageContext {
  theme:        ThemeTokens
  styles:       PdfStyles
  dark:         boolean
  sectionLabel: string | null // "02" (NUMBERED), "—" (RULE), or null (NONE)
  pageNum:      number
  footerLabel:  string
}

/** Standard header (label + title + accent rule) used by every typed page. */
export function SectionHeader({ ctx, title }: { ctx: TypedSectionPageContext; title: string }) {
  const { styles, dark, sectionLabel } = ctx
  return (
    <>
      {sectionLabel !== null && <Text style={styles.sectionLabel}>{sectionLabel}</Text>}
      <Text style={dark ? styles.sectionTitleDark : styles.sectionTitleLight}>{title}</Text>
      <View style={styles.sectionRule} />
    </>
  )
}

/** Body paragraphs split on blank lines — the standard prose treatment. */
export function BodyParagraphs({ ctx, text }: { ctx: TypedSectionPageContext; text: string }) {
  const { styles, dark } = ctx
  return (
    <>
      {text.split("\n\n").map((paragraph, i) => (
        <Text key={i} style={dark ? styles.bodyTextDark : styles.bodyTextLight}>{paragraph.trim()}</Text>
      ))}
    </>
  )
}

// Palette helpers for the typed components — derived from the same tokens.
export function mutedColor(dark: boolean): string {
  return dark ? "#A8A39A" : "#4A4742"
}
export function faintColor(dark: boolean): string {
  return dark ? "#7A766C" : "#8C8980"
}
export function strongColor(dark: boolean): string {
  return dark ? "#F5F3EE" : "#1C1B19"
}
export function cardBorderColor(dark: boolean): string {
  return dark ? "#2A2924" : "#E3DFD6"
}
