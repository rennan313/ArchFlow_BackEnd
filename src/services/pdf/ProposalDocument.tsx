import React from "react"
import {
  Document, Page, Text, View, StyleSheet, Font, Image,
  type DocumentProps,
} from "@react-pdf/renderer"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposalPdfData {
  id:          string
  clientName:  string
  projectType: string
  city?:       string | null
  style?:      string | null
  createdAt:   string

  generated: {
    cover: { title: string; subtitle: string; projectType: string; city: string; style: string }
    summary:                { title: string; content: string }
    clientUnderstanding:    { title: string; content: string }
    architecturalDirection: { title: string; content: string }
    objectives:  { title: string; description: string }[]
    scope: {
      included: { item: string; description: string }[]
      excluded: string[]
    }
    stages: { number: number; name: string; duration: string; description: string; deliverables: string[] }[]
    timeline: { phase: string; duration: string; description: string; milestone?: string }[]
    investment: { pricingMethod: string; estimatedValue: string; paymentConditions: string[] }
    differentials: { title: string; description: string }[]
    risks: { risk: string; mitigation: string; severity: "low" | "medium" | "high" }[]
    finalConsiderations: { title: string; content: string }
  }

  branding?: {
    officeName?:    string | null
    tradeName?:     string | null
    architectName?: string | null
    cauNumber?:     string | null
    email?:         string | null
    phone?:         string | null
    logoUrl?:       string | null
    primaryColor?:  string | null
  } | null
}

// ─── Fonts ────────────────────────────────────────────────────────────────────

Font.register({
  family: "Inter",
  fonts: [
    { src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2",  fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff2",  fontWeight: 600 },
    { src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiA.woff2", fontWeight: 700 },
    { src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuJKfAZ9hiA.woff2", fontWeight: 900 },
  ],
})

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  violet:    "#7c3aed",
  violetLight: "#ede9fe",
  dark:      "#09090b",
  darkMid:   "#18181b",
  zinc800:   "#27272a",
  zinc700:   "#3f3f46",
  zinc600:   "#52525b",
  zinc400:   "#a1a1aa",
  zinc300:   "#d4d4d8",
  zinc200:   "#e4e4e7",
  zinc100:   "#f4f4f5",
  zinc50:    "#fafafa",
  white:     "#ffffff",
  emerald:   "#059669",
  amber:     "#d97706",
  red:       "#dc2626",
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: { fontFamily: "Inter", backgroundColor: C.white },
  pageDark: { fontFamily: "Inter", backgroundColor: C.dark },

  // Cover
  cover: { flex: 1, padding: 0, position: "relative", backgroundColor: C.dark },
  coverAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.violet },
  coverContent: { flex: 1, padding: 48, justifyContent: "space-between" },
  coverTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  coverLogo: { flexDirection: "row", alignItems: "center", gap: 10 },
  coverLogoDot: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.violet, justifyContent: "center", alignItems: "center" },
  coverLogoText: { fontSize: 13, fontWeight: 700, color: C.white, letterSpacing: 0.5 },
  coverCode: { fontSize: 8, fontWeight: 600, color: C.zinc600, letterSpacing: 3, textTransform: "uppercase" },
  coverCenter: { flex: 1, justifyContent: "center", paddingVertical: 48 },
  coverTag: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 },
  coverTagLine: { width: 28, height: 1, backgroundColor: C.violet },
  coverTagText: { fontSize: 8, color: "#a78bfa", fontWeight: 600, letterSpacing: 3, textTransform: "uppercase" },
  coverTitle: { fontSize: 32, fontWeight: 900, color: C.white, lineHeight: 1.2, marginBottom: 12, maxWidth: 500 },
  coverSubtitle: { fontSize: 13, color: C.zinc400, lineHeight: 1.6, maxWidth: 440, marginBottom: 40 },
  coverMeta: { borderTopWidth: 1, borderTopColor: C.zinc800, paddingTop: 24, flexDirection: "row", justifyContent: "space-between" },
  coverMetaItem: { gap: 4 },
  coverMetaLabel: { fontSize: 7, color: C.zinc600, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" },
  coverMetaValue: { fontSize: 11, color: C.zinc400, fontWeight: 600 },
  coverBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  coverOffice: { gap: 3 },
  coverOfficeName: { fontSize: 12, fontWeight: 700, color: C.white },
  coverOfficeDetail: { fontSize: 9, color: C.zinc600 },
  coverDate: { fontSize: 9, color: C.zinc600, textAlign: "right" },

  // Section pages
  sectionDark: { flex: 1, padding: 48, backgroundColor: C.dark },
  sectionLight: { flex: 1, padding: 48, backgroundColor: C.white },
  sectionNum: { fontSize: 7, fontWeight: 900, color: C.zinc800, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 },
  sectionNumLight: { fontSize: 7, fontWeight: 900, color: C.zinc400, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 },
  sectionTitle: { fontSize: 22, fontWeight: 900, color: C.white, lineHeight: 1.3, marginBottom: 6 },
  sectionTitleLight: { fontSize: 22, fontWeight: 900, color: C.dark, lineHeight: 1.3, marginBottom: 6 },
  sectionAccent: { width: 32, height: 2, backgroundColor: C.violet, marginBottom: 20 },
  bodyText: { fontSize: 10, color: C.zinc400, lineHeight: 1.8, marginBottom: 12 },
  bodyTextLight: { fontSize: 10, color: C.zinc600, lineHeight: 1.8, marginBottom: 12 },

  // Cards
  card: { backgroundColor: C.darkMid, borderRadius: 8, padding: 16, marginBottom: 10 },
  cardLight: { backgroundColor: C.zinc50, borderRadius: 8, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.zinc200 },
  cardTitle: { fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 4 },
  cardTitleLight: { fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 4 },
  cardBody: { fontSize: 9, color: C.zinc400, lineHeight: 1.6 },
  cardBodyLight: { fontSize: 9, color: C.zinc600, lineHeight: 1.6 },

  // Grid
  grid2: { flexDirection: "row", gap: 12, marginBottom: 10 },
  gridItem: { flex: 1 },

  // Tags
  tag: { backgroundColor: C.zinc800, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 6 },
  tagText: { fontSize: 8, color: C.zinc400, fontWeight: 600 },
  tagViolet: { backgroundColor: "#2e1065", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 6 },
  tagVioletText: { fontSize: 8, color: "#c4b5fd", fontWeight: 600 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },

  // Timeline/stages
  stageRow: { flexDirection: "row", gap: 14, marginBottom: 14 },
  stageNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.violet, justifyContent: "center", alignItems: "center" },
  stageNumText: { fontSize: 10, fontWeight: 900, color: C.white },
  stageContent: { flex: 1 },
  stageName: { fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 3 },
  stageDuration: { fontSize: 8, color: C.zinc600, marginBottom: 4, letterSpacing: 1 },
  stageBody: { fontSize: 9, color: C.zinc400, lineHeight: 1.6 },

  // Risk severity
  riskHigh:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.red },
  riskMed:    { width: 6, height: 6, borderRadius: 3, backgroundColor: C.amber },
  riskLow:    { width: 6, height: 6, borderRadius: 3, backgroundColor: C.emerald },

  // Footer
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerLine: { borderTopWidth: 1, borderTopColor: C.zinc800, marginBottom: 8 },
  footerLineLt: { borderTopWidth: 1, borderTopColor: C.zinc200, marginBottom: 8 },
  footerText: { fontSize: 7, color: C.zinc700 },
  footerTextLt: { fontSize: 7, color: C.zinc400 },

  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: C.zinc800, marginVertical: 16 },
  dividerLight: { borderBottomWidth: 1, borderBottomColor: C.zinc200, marginVertical: 16 },

  // Investment
  investRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  investBox: { flex: 1, backgroundColor: C.violet, borderRadius: 8, padding: 16 },
  investBoxLight: { flex: 1, backgroundColor: C.violetLight, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: "#ddd6fe" },
  investLabel: { fontSize: 8, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 },
  investLabelLight: { fontSize: 8, color: C.violet, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 },
  investValue: { fontSize: 16, fontWeight: 900, color: C.white },
  investValueLight: { fontSize: 16, fontWeight: 900, color: C.violet },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function proposalCode(id: string) {
  const num = parseInt(id.slice(-4), 16) % 9999 + 1
  return `ARQ-${String(num).padStart(4, "0")}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

function Footer({ label, page, dark }: { label?: string; page: number; dark?: boolean }) {
  return (
    <View style={S.footer}>
      <View style={{ flex: 1 }}>
        <View style={dark ? S.footerLine : S.footerLineLt} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={dark ? S.footerText : S.footerTextLt}>{label ?? "ArchFlow"}</Text>
          <Text style={dark ? S.footerText : S.footerTextLt}>{page}</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Document ─────────────────────────────────────────────────────────────────

export function ProposalDocument({ data }: { data: ProposalPdfData } & DocumentProps) {
  const { generated: g, branding, id, clientName, projectType, city, createdAt } = data
  const code        = proposalCode(id)
  const officeName  = branding?.tradeName ?? branding?.officeName ?? "ArchFlow"
  const footerLabel = `${officeName} · ${code}`

  return (
    <Document
      title={g.cover.title}
      author={branding?.architectName ?? officeName}
      subject={`Proposta — ${clientName}`}
      creator="ArchFlow"
      producer="ArchFlow PDF Engine"
    >
      {/* ── 1. COVER ─────────────────────────────────────────────────── */}
      <Page size="A4" style={S.pageDark}>
        <View style={S.cover}>
          <View style={S.coverAccent} />
          <View style={S.coverContent}>
            {/* Top bar */}
            <View style={S.coverTop}>
              <View style={S.coverLogo}>
                <View style={S.coverLogoDot}>
                  <Text style={{ fontSize: 10, fontWeight: 900, color: C.white }}>A</Text>
                </View>
                <View>
                  <Text style={S.coverLogoText}>{officeName}</Text>
                  {branding?.architectName && (
                    <Text style={{ fontSize: 7, color: C.zinc600, letterSpacing: 1 }}>{branding.architectName}</Text>
                  )}
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={S.coverCode}>Proposta Comercial</Text>
                <Text style={{ fontSize: 8, color: C.zinc700, marginTop: 2, letterSpacing: 2 }}>{code}</Text>
              </View>
            </View>

            {/* Center */}
            <View style={S.coverCenter}>
              <View style={S.coverTag}>
                <View style={S.coverTagLine} />
                <Text style={S.coverTagText}>
                  {projectType}{city ? ` · ${city.split("—")[0].trim()}` : ""}
                </Text>
              </View>
              <Text style={S.coverTitle}>{g.cover.title}</Text>
              <Text style={S.coverSubtitle}>{g.cover.subtitle}</Text>

              <View style={S.coverMeta}>
                <View style={S.coverMetaItem}>
                  <Text style={S.coverMetaLabel}>Cliente</Text>
                  <Text style={S.coverMetaValue}>{clientName}</Text>
                </View>
                <View style={S.coverMetaItem}>
                  <Text style={S.coverMetaLabel}>Tipo</Text>
                  <Text style={S.coverMetaValue}>{projectType}</Text>
                </View>
                {city && (
                  <View style={S.coverMetaItem}>
                    <Text style={S.coverMetaLabel}>Localização</Text>
                    <Text style={S.coverMetaValue}>{city.split("—")[0].trim()}</Text>
                  </View>
                )}
                <View style={S.coverMetaItem}>
                  <Text style={S.coverMetaLabel}>Data</Text>
                  <Text style={S.coverMetaValue}>{fmtDate(createdAt)}</Text>
                </View>
              </View>
            </View>

            {/* Bottom */}
            <View style={S.coverBottom}>
              <View style={S.coverOffice}>
                <Text style={S.coverOfficeName}>{officeName}</Text>
                {branding?.email && <Text style={S.coverOfficeDetail}>{branding.email}</Text>}
                {branding?.phone && <Text style={S.coverOfficeDetail}>{branding.phone}</Text>}
                {branding?.cauNumber && <Text style={S.coverOfficeDetail}>CAU {branding.cauNumber}</Text>}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 8, color: C.zinc600 }}>Válida por 30 dias · {code}</Text>
                <Text style={{ fontSize: 7, color: C.zinc800, marginTop: 4 }}>Gerado por ArchFlow</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>

      {/* ── 2. SUMMARY ───────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionLight, { paddingBottom: 80 }]}>
          <Text style={S.sectionNumLight}>01 — {g.summary.title}</Text>
          <Text style={S.sectionTitleLight}>{g.summary.title}</Text>
          <View style={S.sectionAccent} />
          {g.summary.content.split("\n\n").map((p, i) => (
            <Text key={i} style={S.bodyTextLight}>{p.trim()}</Text>
          ))}

          <View style={S.dividerLight} />

          <Text style={[S.sectionNumLight, { marginTop: 8 }]}>02 — {g.clientUnderstanding.title}</Text>
          <Text style={[S.sectionTitleLight, { fontSize: 16 }]}>{g.clientUnderstanding.title}</Text>
          <View style={[S.sectionAccent, { marginBottom: 14 }]} />
          {g.clientUnderstanding.content.split("\n\n").map((p, i) => (
            <Text key={i} style={S.bodyTextLight}>{p.trim()}</Text>
          ))}
        </View>
        <Footer label={footerLabel} page={2} />
      </Page>

      {/* ── 3. ARCHITECTURAL DIRECTION ───────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionDark, { paddingBottom: 80 }]}>
          <Text style={S.sectionNum}>03 — Direção Arquitetônica</Text>
          <Text style={S.sectionTitle}>{g.architecturalDirection.title}</Text>
          <View style={S.sectionAccent} />
          {g.architecturalDirection.content.split("\n\n").map((p, i) => (
            <Text key={i} style={S.bodyText}>{p.trim()}</Text>
          ))}
        </View>
        <Footer label={footerLabel} page={3} dark />
      </Page>

      {/* ── 4. OBJECTIVES ────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionLight, { paddingBottom: 80 }]}>
          <Text style={S.sectionNumLight}>04 — Objetivos do Projeto</Text>
          <Text style={S.sectionTitleLight}>Objetivos do Projeto</Text>
          <View style={S.sectionAccent} />
          <View style={S.grid2}>
            {g.objectives.map((obj, i) => (
              <View key={i} style={[S.gridItem, S.cardLight]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.violet, justifyContent: "center", alignItems: "center" }}>
                    <Text style={{ fontSize: 8, fontWeight: 900, color: C.white }}>{i + 1}</Text>
                  </View>
                  <Text style={S.cardTitleLight}>{obj.title}</Text>
                </View>
                <Text style={S.cardBodyLight}>{obj.description}</Text>
              </View>
            ))}
          </View>
        </View>
        <Footer label={footerLabel} page={4} />
      </Page>

      {/* ── 5. SCOPE ─────────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionLight, { paddingBottom: 80 }]}>
          <Text style={S.sectionNumLight}>05 — Escopo do Projeto</Text>
          <Text style={S.sectionTitleLight}>Escopo do Projeto</Text>
          <View style={S.sectionAccent} />

          <Text style={{ fontSize: 9, fontWeight: 700, color: C.zinc600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            Incluído
          </Text>
          {g.scope.included.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, marginBottom: 8, paddingBottom: 8, borderBottomWidth: i < g.scope.included.length - 1 ? 1 : 0, borderBottomColor: C.zinc100 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.violetLight, justifyContent: "center", alignItems: "center", marginTop: 1 }}>
                <Text style={{ fontSize: 7, color: C.violet, fontWeight: 900 }}>✓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: 700, color: C.dark, marginBottom: 2 }}>{item.item}</Text>
                <Text style={{ fontSize: 9, color: C.zinc600, lineHeight: 1.5 }}>{item.description}</Text>
              </View>
            </View>
          ))}

          {g.scope.excluded.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: C.zinc600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                Não Incluído
              </Text>
              <View style={S.tagRow}>
                {g.scope.excluded.map((ex, i) => (
                  <View key={i} style={S.tag}>
                    <Text style={S.tagText}>{ex}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
        <Footer label={footerLabel} page={5} />
      </Page>

      {/* ── 6. STAGES ────────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionDark, { paddingBottom: 80 }]}>
          <Text style={S.sectionNum}>06 — Etapas do Projeto</Text>
          <Text style={S.sectionTitle}>Etapas do Projeto</Text>
          <View style={S.sectionAccent} />
          {g.stages.map((stage, i) => (
            <View key={i} style={S.stageRow}>
              <View style={S.stageNum}>
                <Text style={S.stageNumText}>{stage.number}</Text>
              </View>
              <View style={S.stageContent}>
                <Text style={S.stageName}>{stage.name}</Text>
                <Text style={S.stageDuration}>{stage.duration}</Text>
                <Text style={S.stageBody}>{stage.description}</Text>
                {stage.deliverables.length > 0 && (
                  <View style={[S.tagRow, { marginTop: 6 }]}>
                    {stage.deliverables.map((d, j) => (
                      <View key={j} style={S.tag}>
                        <Text style={S.tagText}>{d}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
        <Footer label={footerLabel} page={6} dark />
      </Page>

      {/* ── 7. TIMELINE ──────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionLight, { paddingBottom: 80 }]}>
          <Text style={S.sectionNumLight}>07 — Cronograma</Text>
          <Text style={S.sectionTitleLight}>Cronograma</Text>
          <View style={S.sectionAccent} />
          {g.timeline.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 14, marginBottom: 12 }}>
              <View style={{ width: 2, backgroundColor: i < g.timeline.length - 1 ? C.violet : "transparent", alignSelf: "stretch", marginTop: 4 }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: 700, color: C.dark }}>{item.phase}</Text>
                  <View style={{ backgroundColor: C.violetLight, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 8, fontWeight: 700, color: C.violet }}>{item.duration}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 9, color: C.zinc600, lineHeight: 1.6, marginBottom: item.milestone ? 4 : 0 }}>{item.description}</Text>
                {item.milestone && (
                  <Text style={{ fontSize: 8, color: C.violet, fontWeight: 700 }}>⬥ {item.milestone}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
        <Footer label={footerLabel} page={7} />
      </Page>

      {/* ── 8. INVESTMENT ────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionDark, { paddingBottom: 80 }]}>
          <Text style={S.sectionNum}>08 — Investimento</Text>
          <Text style={S.sectionTitle}>Investimento</Text>
          <View style={S.sectionAccent} />

          <View style={S.investRow}>
            <View style={S.investBox}>
              <Text style={S.investLabel}>Método</Text>
              <Text style={S.investValue}>{g.investment.pricingMethod}</Text>
            </View>
            <View style={S.investBox}>
              <Text style={S.investLabel}>Valor Estimado</Text>
              <Text style={S.investValue}>{g.investment.estimatedValue}</Text>
            </View>
          </View>

          <View style={S.divider} />

          <Text style={{ fontSize: 9, fontWeight: 700, color: C.zinc600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            Condições de Pagamento
          </Text>
          {g.investment.paymentConditions.map((c, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.zinc800, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 8, color: C.violet, fontWeight: 900 }}>{i + 1}</Text>
              </View>
              <Text style={{ fontSize: 10, color: C.zinc400, flex: 1, lineHeight: 1.6, marginTop: 2 }}>{c}</Text>
            </View>
          ))}
        </View>
        <Footer label={footerLabel} page={8} dark />
      </Page>

      {/* ── 9. DIFFERENTIALS ─────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionLight, { paddingBottom: 80 }]}>
          <Text style={S.sectionNumLight}>09 — Diferenciais</Text>
          <Text style={S.sectionTitleLight}>Nossos Diferenciais</Text>
          <View style={S.sectionAccent} />
          <View style={S.grid2}>
            {g.differentials.map((d, i) => (
              <View key={i} style={[S.gridItem, S.cardLight]}>
                <View style={{ width: 24, height: 3, backgroundColor: C.violet, borderRadius: 2, marginBottom: 10 }} />
                <Text style={S.cardTitleLight}>{d.title}</Text>
                <Text style={S.cardBodyLight}>{d.description}</Text>
              </View>
            ))}
          </View>
        </View>
        <Footer label={footerLabel} page={9} />
      </Page>

      {/* ── 10. RISKS ────────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionDark, { paddingBottom: 80 }]}>
          <Text style={S.sectionNum}>10 — Riscos & Atenção</Text>
          <Text style={S.sectionTitle}>Pontos de Atenção</Text>
          <View style={S.sectionAccent} />
          {g.risks.map((risk, i) => (
            <View key={i} style={[S.card, { flexDirection: "row", gap: 12 }]}>
              <View style={{ marginTop: 4 }}>
                {risk.severity === "high"   && <View style={S.riskHigh} />}
                {risk.severity === "medium" && <View style={S.riskMed} />}
                {risk.severity === "low"    && <View style={S.riskLow} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.cardTitle}>{risk.risk}</Text>
                <Text style={[S.cardBody, { color: "#6b7280" }]}>Mitigação: {risk.mitigation}</Text>
              </View>
            </View>
          ))}
        </View>
        <Footer label={footerLabel} page={10} dark />
      </Page>

      {/* ── 11. FINAL CONSIDERATIONS ─────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={[S.sectionLight, { paddingBottom: 80 }]}>
          <Text style={S.sectionNumLight}>11 — {g.finalConsiderations.title}</Text>
          <Text style={S.sectionTitleLight}>{g.finalConsiderations.title}</Text>
          <View style={S.sectionAccent} />
          {g.finalConsiderations.content.split("\n\n").map((p, i) => (
            <Text key={i} style={S.bodyTextLight}>{p.trim()}</Text>
          ))}

          <View style={[S.dividerLight, { marginTop: 32 }]} />

          {/* Signature area */}
          <View style={{ marginTop: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: C.zinc300, paddingBottom: 8, marginRight: 40 }}>
              <Text style={{ fontSize: 8, color: C.zinc400, textAlign: "center" }}>
                {branding?.architectName ?? officeName}
                {branding?.cauNumber ? ` · CAU ${branding.cauNumber}` : ""}
              </Text>
            </View>
            <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: C.zinc300, paddingBottom: 8 }}>
              <Text style={{ fontSize: 8, color: C.zinc400, textAlign: "center" }}>{clientName}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ fontSize: 7, color: C.zinc400, flex: 1, textAlign: "center" }}>Prestador de serviços</Text>
            <Text style={{ fontSize: 7, color: C.zinc400, flex: 1, textAlign: "center" }}>Contratante</Text>
          </View>

          {/* Footer stamp */}
          <View style={{ marginTop: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 7, color: C.zinc300 }}>
              {code} · Gerado em {fmtDate(createdAt)} · ArchFlow
            </Text>
          </View>
        </View>
        <Footer label={footerLabel} page={11} />
      </Page>
    </Document>
  )
}
