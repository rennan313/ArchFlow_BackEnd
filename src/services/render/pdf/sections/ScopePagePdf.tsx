import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeScope } from "@/types/proposal-premium-narrative"
import { Footer, SectionHeader, mutedColor, strongColor, cardBorderColor, type TypedSectionPageContext } from "../pdf-shared"

export function ScopePagePdf({ payload, ctx }: { payload: PremiumNarrativeScope; ctx: TypedSectionPageContext }) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx

  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />

      {payload.items.map((item, i) => (
        // wrap={false}: a service card is an atomic unit — push it whole to
        // the next page rather than slicing between description and benefit.
        <View
          key={i}
          wrap={false}
          style={{
            marginBottom: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: cardBorderColor(dark),
            borderRadius: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ width: 22, fontSize: 9, fontWeight: 700, color: theme.colors.accent }}>
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Text style={{ fontSize: theme.typography.bodySize + 1.5, fontWeight: 700, color: strongColor(dark) }}>
              {item.name}
            </Text>
          </View>
          <Text style={{ fontSize: theme.typography.bodySize, color: mutedColor(dark), lineHeight: 1.6, marginBottom: 8, marginLeft: 22 }}>
            {item.description}
          </Text>
          {item.benefit ? (
            <View style={{ flexDirection: "row", marginLeft: 22, paddingTop: 6, borderTopWidth: 1, borderTopColor: cardBorderColor(dark) }}>
              <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: theme.colors.accent, marginRight: 8, marginTop: 1 }}>
                Benefício
              </Text>
              <Text style={{ flex: 1, fontSize: theme.typography.bodySize - 0.5, color: mutedColor(dark), lineHeight: 1.5 }}>
                {item.benefit}
              </Text>
            </View>
          ) : null}
        </View>
      ))}

      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
