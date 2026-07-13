import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeDeliverables } from "@/types/proposal-premium-narrative"
import { Footer, SectionHeader, mutedColor, strongColor, faintColor, cardBorderColor, type TypedSectionPageContext } from "../pdf-shared"

export function DeliverablesPagePdf({ payload, ctx }: { payload: PremiumNarrativeDeliverables; ctx: TypedSectionPageContext }) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx
  const included = payload.items.filter((i) => i.included)
  const excluded = payload.items.filter((i) => !i.included)

  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />

      {/* Checklist cards, two columns — each card atomic (wrap={false}) */}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {included.map((item) => (
          <View
            key={item.label}
            wrap={false}
            style={{
              width: "48%",
              marginRight: "2%",
              marginBottom: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: cardBorderColor(dark),
              borderRadius: 4,
              flexDirection: "row",
              alignItems: "flex-start",
            }}
          >
            <Text style={{ width: 16, fontSize: 11, fontWeight: 700, color: theme.colors.accent }}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: theme.typography.bodySize, fontWeight: 600, color: strongColor(dark) }}>
                {item.label}
              </Text>
              {item.note ? (
                <Text style={{ fontSize: theme.typography.bodySize - 1, color: faintColor(dark), lineHeight: 1.5, marginTop: 3 }}>
                  {item.note}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {excluded.length > 0 && (
        <View wrap={false} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: faintColor(dark), marginBottom: 8 }}>
            Não contemplado nesta proposta
          </Text>
          {excluded.map((item) => (
            <Text key={item.label} style={{ fontSize: theme.typography.bodySize - 0.5, color: mutedColor(dark), lineHeight: 1.7 }}>
              — {item.label}{item.note ? ` (${item.note})` : ""}
            </Text>
          ))}
        </View>
      )}

      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
