import React from "react"
import path from "path"
import { Document, Page, Text, View, StyleSheet, Font, type DocumentProps } from "@react-pdf/renderer"
import type { RenderDocument, ThemeTokens } from "@/types/proposal-render-model"

// ─── Etapa 4 (Fase 2.0) / Fase 2.1 design pass — the PDF layer ─────────────
// Consumes ONLY RenderDocument + ThemeTokens. Renders exactly as many
// sections as RenderDocument.sections contains, in that exact order.
//
// Fase 2.1 fixes applied here (found via real PDF inspection, not code
// review — see the audit report):
//   1. Cover meta row: items had no explicit width/gap and visually
//      collided ("LOCALIZAÇÃODATA" running together). Now a fixed 4-column
//      grid with real gutters.
//   2. react-pdf's default hyphenation broke names mid-word ("An-\ndrade").
//      Disabled globally via registerHyphenationCallback.
//   3. theme.coverLayout was defined but never read — the cover always
//      rendered DARK_FULL_BLEED regardless of skin. Now actually branches
//      on it (DARK_FULL_BLEED / LIGHT_MINIMAL / SPLIT).
//   4. Section content that looks like a list (lines starting with "-",
//      "•", or "N.") now renders as a bordered ledger-style list instead of
//      a paragraph blob — addresses "valores devem parecer orçamento
//      executivo, não tabela técnica de sistema" generically, for any
//      section (works for migrated legacy "Investimento"/"Riscos" content
//      and any future list-like content alike).

const FONTS_DIR = path.join(process.cwd(), "src/assets/fonts/inter")
let fontsRegistered = false
function ensureFonts() {
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
  // Fix #2 — never break a word across lines (default hyphenation produced
  // "An-\ndrade" for "Andrade"). Treat every word as a single unbreakable unit.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

function buildStyles(theme: ThemeTokens) {
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

    // Meta row — fix #1: explicit fixed-width columns with real gutters
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

    // Content-aware list/ledger rendering (fix #4)
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

// Detects "list-like" content (bullets, dashes, numbered lines) saved by
// the legacy migrator or typed manually, and splits it into discrete rows
// instead of one paragraph blob.
function parseListLines(content: string): string[] | null {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const listLike = lines.filter((l) => /^([-•✓✔]|\d+[.)])\s+/.test(l))
  if (listLike.length < lines.length * 0.6) return null // not predominantly list-shaped
  return lines.map((l) => l.replace(/^([-•✓✔]|\d+[.)])\s+/, ""))
}

function Footer({ label, page, dark, styles }: { label: string; page: number; dark: boolean; styles: ReturnType<typeof buildStyles> }) {
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

function MetaRow({ doc, styles, dark }: { doc: RenderDocument; styles: ReturnType<typeof buildStyles>; dark: boolean }) {
  const labelColor = dark ? "#7A766C" : "#8C8980"
  const valueColor = dark ? "#F5F3EE" : "#1C1B19"
  const items = [
    { label: "Cliente", value: doc.cover.clientName },
    { label: "Tipo", value: doc.cover.projectType },
    { label: "Localização", value: doc.cover.location },
    { label: "Data", value: fmtDate(doc.cover.createdAt) },
  ]
  return (
    <View style={styles.metaRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: labelColor }]}>{item.label}</Text>
          <Text style={[styles.metaValue, { color: valueColor }]}>{item.value}</Text>
        </View>
      ))}
    </View>
  )
}

function CoverDark({ doc, styles }: { doc: RenderDocument; styles: ReturnType<typeof buildStyles> }) {
  return (
    <View style={styles.coverDark}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.coverDarkOffice}>{doc.footer.officeName ?? "—"}</Text>
        <Text style={styles.coverDarkMuted}>{doc.metadata.code}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={[styles.coverEyebrow, styles.coverDarkEyebrow]}>{doc.cover.projectType} · {doc.cover.location}</Text>
        <Text style={[styles.coverTitle, styles.coverDarkTitle]}>{doc.cover.title}</Text>
        <Text style={[styles.coverSubtitle, styles.coverDarkSubtitle]}>{doc.cover.subtitle}</Text>
        <MetaRow doc={doc} styles={styles} dark />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          {doc.cover.architectName && <Text style={styles.coverDarkMuted}>{doc.cover.architectName}</Text>}
          {doc.cover.cauNumber && <Text style={styles.coverDarkMuted}>CAU {doc.cover.cauNumber}</Text>}
        </View>
        <Text style={styles.coverDarkMuted}>Proposta confidencial · {fmtDate(doc.cover.createdAt)}</Text>
      </View>
    </View>
  )
}

function CoverLight({ doc, styles }: { doc: RenderDocument; styles: ReturnType<typeof buildStyles> }) {
  return (
    <View style={styles.coverLight}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.coverLightOffice}>{doc.footer.officeName ?? "—"}</Text>
        <Text style={styles.coverLightMuted}>{doc.metadata.code}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={[styles.coverEyebrow, styles.coverLightEyebrow]}>{doc.cover.projectType} · {doc.cover.location}</Text>
        <Text style={[styles.coverTitle, styles.coverLightTitle]}>{doc.cover.title}</Text>
        <Text style={[styles.coverSubtitle, styles.coverLightSubtitle]}>{doc.cover.subtitle}</Text>
        <View style={styles.coverLightTopRule} />
        <MetaRow doc={doc} styles={styles} dark={false} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          {doc.cover.architectName && <Text style={styles.coverLightMuted}>{doc.cover.architectName}</Text>}
          {doc.cover.cauNumber && <Text style={styles.coverLightMuted}>CAU {doc.cover.cauNumber}</Text>}
        </View>
        <Text style={styles.coverLightMuted}>Proposta confidencial · {fmtDate(doc.cover.createdAt)}</Text>
      </View>
    </View>
  )
}

function CoverSplit({ doc, styles }: { doc: RenderDocument; styles: ReturnType<typeof buildStyles> }) {
  return (
    <View style={styles.coverSplit}>
      <View style={styles.coverSplitPanel}>
        <Text style={[styles.coverEyebrow, { color: "#A8A39A", marginBottom: 8 }]}>{doc.footer.officeName ?? "—"}</Text>
        <View>
          <Text style={styles.coverSplitPanelLabel}>Cliente</Text>
          <Text style={styles.coverSplitPanelValue}>{doc.cover.clientName}</Text>
          <Text style={styles.coverSplitPanelLabel}>Localização</Text>
          <Text style={styles.coverSplitPanelValue}>{doc.cover.location}</Text>
          <Text style={styles.coverSplitPanelLabel}>Data</Text>
          <Text style={styles.coverSplitPanelValue}>{fmtDate(doc.cover.createdAt)}</Text>
        </View>
        <Text style={{ fontSize: 7, color: "#7A766C" }}>{doc.metadata.code}</Text>
      </View>
      <View style={styles.coverSplitMain}>
        <Text style={[styles.coverEyebrow, styles.coverLightEyebrow]}>{doc.cover.projectType}</Text>
        <Text style={[styles.coverTitle, styles.coverLightTitle]}>{doc.cover.title}</Text>
        <Text style={[styles.coverSubtitle, styles.coverLightSubtitle]}>{doc.cover.subtitle}</Text>
      </View>
    </View>
  )
}

function SectionBody({ section, dark, styles }: { section: RenderDocument["sections"][number]; dark: boolean; styles: ReturnType<typeof buildStyles> }) {
  if (section.isEmpty) {
    return <Text style={styles.emptyHint}>Esta seção ainda não possui conteúdo.</Text>
  }

  const listLines = parseListLines(section.content)
  if (listLines) {
    return (
      <View>
        {listLines.map((line, i) => (
          <View key={i} style={[styles.listRow, dark ? styles.listRowDark : styles.listRowLight]}>
            <Text style={styles.listMarker}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={[styles.listText, { color: dark ? "#A8A39A" : "#4A4742" }]}>{line}</Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <>
      {section.content.split("\n\n").map((paragraph, i) => (
        <Text key={i} style={dark ? styles.bodyTextDark : styles.bodyTextLight}>{paragraph.trim()}</Text>
      ))}
    </>
  )
}

export function RenderDocumentPdf({ doc, theme }: { doc: RenderDocument; theme: ThemeTokens } & DocumentProps) {
  ensureFonts()
  const styles = buildStyles(theme)
  const footerLabel = `${doc.footer.officeName ?? "ArchFlow"} · ${doc.footer.code}`
  const allSections = [...doc.sections, ...doc.appendix]

  return (
    <Document
      title={doc.cover.title}
      author={doc.cover.architectName ?? doc.footer.officeName ?? "ArchFlow"}
      subject={`Proposta — ${doc.cover.clientName}`}
      creator="ArchFlow"
      producer="ArchFlow PDF Engine"
    >
      {/* Cover — full-bleed, layout depends on theme.coverLayout (fix #3) */}
      <Page size="A4" style={styles.pageCover}>
        {theme.coverLayout === "LIGHT_MINIMAL" && <CoverLight doc={doc} styles={styles} />}
        {theme.coverLayout === "SPLIT" && <CoverSplit doc={doc} styles={styles} />}
        {theme.coverLayout === "DARK_FULL_BLEED" && <CoverDark doc={doc} styles={styles} />}
      </Page>

      {/* One page per section, in exactly the order saved in the Editor */}
      {allSections.map((section, index) => {
        // Fix — dark/light page alternation only makes sense for skins whose
        // cover is genuinely dark (DARK_FULL_BLEED). For LIGHT_MINIMAL/SPLIT
        // skins, backgroundAlt is just a subtle warm-paper tint, not a dark
        // tone — using sectionTitleDark/bodyTextDark (near-white) against it
        // rendered text that was nearly invisible (found via real PDF
        // inspection: a legacy-migrated "Investimento" page).
        const usesDarkAlternation = theme.coverLayout === "DARK_FULL_BLEED"
        const dark = usesDarkAlternation && index % 2 === 1
        const pageNum = index + 2 // page 1 is the cover
        return (
          <Page key={section.id} size="A4" style={dark ? styles.pageDark : styles.pageLight}>
            {theme.sectionSeparator !== "NONE" && (
              <Text style={styles.sectionLabel}>
                {theme.sectionSeparator === "NUMBERED" ? String(index + 1).padStart(2, "0") : "—"}
              </Text>
            )}
            <Text style={dark ? styles.sectionTitleDark : styles.sectionTitleLight}>{section.title}</Text>
            <View style={styles.sectionRule} />
            <SectionBody section={section} dark={dark} styles={styles} />
            <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
          </Page>
        )
      })}

      {/* Signature page */}
      <Page size="A4" style={styles.pageLight}>
        <Text style={styles.sectionLabel}>—</Text>
        <Text style={styles.sectionTitleLight}>Aprovação</Text>
        <View style={styles.sectionRule} />
        <View style={{ marginTop: 32, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View style={[styles.signatureBlock, { marginRight: 48 }]}>
            <Text style={{ fontSize: 8, color: "#8C8980", textAlign: "center", marginBottom: 4 }}>
              {doc.cover.architectName ?? doc.footer.officeName}{doc.cover.cauNumber ? ` · CAU ${doc.cover.cauNumber}` : ""}
            </Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={{ fontSize: 8, color: "#8C8980", textAlign: "center", marginBottom: 4 }}>{doc.cover.clientName}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
          <Text style={styles.signatureLabel}>{doc.footer.signatureLabelLeft}</Text>
          <Text style={styles.signatureLabel}>{doc.footer.signatureLabelRight}</Text>
        </View>
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <Text style={{ fontSize: 7, color: "#C9C4B8", letterSpacing: 0.5 }}>
            {doc.metadata.code} · Gerado em {fmtDate(doc.cover.createdAt)} · ArchFlow
          </Text>
        </View>
        <Footer label={footerLabel} page={allSections.length + 2} dark={false} styles={styles} />
      </Page>
    </Document>
  )
}
