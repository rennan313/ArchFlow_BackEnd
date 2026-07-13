import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeInvestment, PremiumNarrativeExclusions } from "@/types/proposal-premium-narrative"
import { Footer, SectionHeader, BodyParagraphs, mutedColor, faintColor, cardBorderColor, type TypedSectionPageContext } from "../pdf-shared"

export function InvestmentPagePdf({ payload, ctx }: { payload: PremiumNarrativeInvestment; ctx: TypedSectionPageContext }) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx

  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />

      {/* Dark value card — mirrors the web InvestmentSection's treatment.
          Subtle border keeps the card legible when the page itself is dark
          (DARK_FULL_BLEED skins' alternation). */}
      <View
        wrap={false}
        style={{
          backgroundColor: "#1C1B19",
          borderWidth: 1,
          borderColor: dark ? "#3A3833" : "#1C1B19",
          borderRadius: 6,
          padding: 24,
          marginBottom: 18,
        }}
      >
        <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#A8A39A", marginBottom: 8 }}>
          Investimento total
        </Text>
        <Text style={{ fontSize: 26, fontWeight: 900, color: "#F5F3EE", marginBottom: 4 }}>
          {payload.value}
        </Text>
        {payload.downPayment ? (
          <Text style={{ fontSize: 9, color: theme.colors.accent, marginBottom: 14 }}>
            Entrada: {payload.downPayment}
          </Text>
        ) : (
          <View style={{ marginBottom: 14 }} />
        )}

        {payload.installments.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: "#2A2924", paddingTop: 12 }}>
            <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "#7A766C", marginBottom: 8 }}>
              Condições de pagamento
            </Text>
            {payload.installments.map((c, i) => (
              <View key={i} style={{ flexDirection: "row", marginBottom: 5 }}>
                <Text style={{ width: 16, fontSize: 9, fontWeight: 600, color: theme.colors.accent }}>
                  {String(i + 1).padStart(2, "0")}
                </Text>
                <Text style={{ flex: 1, fontSize: 9.5, color: "#A8A39A", lineHeight: 1.5 }}>{c}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* AI value-justification — never just numbers */}
      {payload.valueJustificationText ? (
        <BodyParagraphs ctx={ctx} text={payload.valueJustificationText} />
      ) : null}

      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}

export function ExclusionsPagePdf({ payload, ctx }: { payload: PremiumNarrativeExclusions; ctx: TypedSectionPageContext }) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx

  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />

      <Text style={{ fontSize: theme.typography.bodySize - 0.5, color: faintColor(dark), lineHeight: 1.7, marginBottom: 14 }}>
        Para garantir total transparência, os itens abaixo não fazem parte do escopo desta proposta.
        Caso necessários, podem ser contratados separadamente.
      </Text>

      {payload.items.map((item, i) => (
        <View key={i} wrap={false} style={[styles.listRow, dark ? styles.listRowDark : styles.listRowLight]}>
          <Text style={styles.listMarker}>{String(i + 1).padStart(2, "0")}</Text>
          <Text style={[styles.listText, { color: mutedColor(dark) }]}>{item}</Text>
        </View>
      ))}

      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
