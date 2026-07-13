import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeClientUnderstanding, ClientUnderstandingFact } from "@/types/proposal-premium-narrative"
import { Footer, SectionHeader, BodyParagraphs, mutedColor, cardBorderColor, type TypedSectionPageContext } from "../pdf-shared"

const FACT_LABELS_PT: Record<ClientUnderstandingFact["label"], string> = {
  objectives:  "Objetivos",
  needs:       "Necessidades",
  preferences: "Preferências",
  constraints: "Restrições",
  budget:      "Orçamento",
  timeline:    "Prazo Esperado",
}

export function ClientUnderstandingPagePdf({ payload, ctx }: { payload: PremiumNarrativeClientUnderstanding; ctx: TypedSectionPageContext }) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx

  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />
      <BodyParagraphs ctx={ctx} text={payload.narrative} />

      {/* Facts grid — two columns of atomic cards; wrap={false} pushes a
          whole card to the next page instead of slicing it mid-card. */}
      {payload.facts.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
          {payload.facts.map((fact) => (
            <View
              key={fact.label}
              wrap={false}
              style={{
                width: "48%",
                marginRight: "2%",
                marginBottom: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: cardBorderColor(dark),
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: theme.colors.accent, marginBottom: 5 }}>
                {FACT_LABELS_PT[fact.label]}
              </Text>
              <Text style={{ fontSize: theme.typography.bodySize, color: mutedColor(dark), lineHeight: 1.6 }}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
