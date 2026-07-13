import React from "react"
import { Document, Page, Text, View, Image, type DocumentProps } from "@react-pdf/renderer"
import type { RenderDocument, RenderVisualRef, ThemeTokens } from "@/types/proposal-render-model"
import { ensureFonts, buildStyles, fmtDate, Footer, type TypedSectionPageContext } from "./pdf-shared"
import { renderTypedSectionPage } from "./sections"

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

// ensureFonts/buildStyles/fmtDate/Footer live in pdf-shared.tsx (Fase A
// extraction) so the typed premium-narrative section components under
// ./sections reuse the exact same fonts, styles and footer.

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

// Cover hero/logo (Fase A): heroImageUrl/logoUrl come from RenderCover —
// resolved fresh at snapshot/mapper time (never baked stale URLs). All three
// layouts render them additively; layout selection stays with coverLayout.
function CoverLogo({ url, height = 28 }: { url: string | null; height?: number }) {
  if (!url) return null
  return <Image src={url} style={{ height, width: 90, objectFit: "contain", objectPositionX: 0 }} />
}

function CoverHero({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <Image
      src={url}
      style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 4, marginBottom: 24 }}
    />
  )
}

function CoverDark({ doc, styles }: { doc: RenderDocument; styles: ReturnType<typeof buildStyles> }) {
  return (
    <View style={styles.coverDark}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        {doc.cover.logoUrl
          ? <CoverLogo url={doc.cover.logoUrl} />
          : <Text style={styles.coverDarkOffice}>{doc.footer.officeName ?? "—"}</Text>}
        <Text style={styles.coverDarkMuted}>{doc.metadata.code}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <CoverHero url={doc.cover.heroImageUrl} />
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
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        {doc.cover.logoUrl
          ? <CoverLogo url={doc.cover.logoUrl} />
          : <Text style={styles.coverLightOffice}>{doc.footer.officeName ?? "—"}</Text>}
        <Text style={styles.coverLightMuted}>{doc.metadata.code}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <CoverHero url={doc.cover.heroImageUrl} />
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
        {doc.cover.logoUrl
          ? <CoverLogo url={doc.cover.logoUrl} height={22} />
          : <Text style={[styles.coverEyebrow, { color: "#A8A39A", marginBottom: 8 }]}>{doc.footer.officeName ?? "—"}</Text>}
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
        <CoverHero url={doc.cover.heroImageUrl} />
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

function VisualRefsPage({
  refs, styles, footerLabel, pageNum,
}: {
  refs:        RenderVisualRef[]
  styles:      ReturnType<typeof buildStyles>
  footerLabel: string
  pageNum:     number
}) {
  if (refs.length === 0) return null

  const images = refs.filter((r) => r.type === "IMAGE" || r.type === "GIF")
  const videos = refs.filter((r) => r.type === "YOUTUBE" || r.type === "VIMEO")

  return (
    <Page size="A4" style={styles.pageLight}>
      <Text style={styles.sectionLabel}>—</Text>
      <Text style={styles.sectionTitleLight}>Referências Visuais</Text>
      <View style={styles.sectionRule} />

      {images.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: videos.length ? 20 : 0 }}>
          {images.map((ref) => (
            <View key={ref.id} style={{ width: images.length === 1 ? "100%" : "48%", marginBottom: 0 }}>
              <Image
                src={ref.url}
                style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 4 }}
              />
            </View>
          ))}
        </View>
      )}

      {videos.length > 0 && (
        <View style={{ gap: 10 }}>
          {videos.map((ref) => (
            <View key={ref.id}>
              {ref.thumbnail && (
                <Image
                  src={ref.thumbnail}
                  style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 4, marginBottom: 4 }}
                />
              )}
              <Text style={{ fontSize: 8, color: "#8C8980", letterSpacing: 0.5 }}>
                {ref.type} · {ref.url}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Footer label={footerLabel} page={pageNum} dark={false} styles={styles} />
    </Page>
  )
}

export function RenderDocumentPdf({ doc, theme }: { doc: RenderDocument; theme: ThemeTokens } & DocumentProps) {
  ensureFonts()
  const styles = buildStyles(theme)
  const footerLabel = `${doc.footer.officeName ?? "ArchFlow"} · ${doc.footer.code}`
  // Premium cover-kind sections enrich page 1 (hero/logo, resolved by the
  // mapper into doc.cover) instead of rendering as a body page — exclude
  // them from the body loop so the cover never appears twice.
  const allSections = [...doc.sections, ...doc.appendix].filter((s) => s.metadata?.kind !== "cover")

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

        // Premium-narrative sections (parsed metadata) get their dedicated
        // typed page; anything else — legacy instances, custom sections,
        // corrupted metadata — keeps the generic template below, unchanged.
        const sectionLabel = theme.sectionSeparator === "NONE"
          ? null
          : theme.sectionSeparator === "NUMBERED" ? String(index + 1).padStart(2, "0") : "—"
        const ctx: TypedSectionPageContext = { theme, styles, dark, sectionLabel, pageNum, footerLabel }
        const typedPage = renderTypedSectionPage(section, doc, ctx)
        if (typedPage) return <React.Fragment key={section.id}>{typedPage}</React.Fragment>

        return (
          <Page key={section.id} size="A4" style={dark ? styles.pageDark : styles.pageLight}>
            {sectionLabel !== null && (
              <Text style={styles.sectionLabel}>{sectionLabel}</Text>
            )}
            <Text style={dark ? styles.sectionTitleDark : styles.sectionTitleLight}>{section.title}</Text>
            <View style={styles.sectionRule} />
            <SectionBody section={section} dark={dark} styles={styles} />
            <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
          </Page>
        )
      })}

      {/* Visual references page — only rendered when media exists */}
      {doc.visualRefs && doc.visualRefs.length > 0 && (
        <VisualRefsPage
          refs={doc.visualRefs}
          styles={styles}
          footerLabel={footerLabel}
          pageNum={allSections.length + 2}
        />
      )}

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
        <Footer label={footerLabel} page={allSections.length + (doc.visualRefs?.length ? 3 : 2)} dark={false} styles={styles} />
      </Page>
    </Document>
  )
}
