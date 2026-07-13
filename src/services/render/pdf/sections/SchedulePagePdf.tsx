import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeSchedule } from "@/types/proposal-premium-narrative"
import { Footer, SectionHeader, mutedColor, strongColor, faintColor, cardBorderColor, type TypedSectionPageContext } from "../pdf-shared"

export function SchedulePagePdf({ payload, ctx }: { payload: PremiumNarrativeSchedule; ctx: TypedSectionPageContext }) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx

  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />

      {payload.totalDuration ? (
        <View wrap={false} style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: faintColor(dark), marginRight: 8 }}>
            Duração total
          </Text>
          <Text style={{ fontSize: theme.typography.bodySize + 2, fontWeight: 700, color: theme.colors.accent }}>
            {payload.totalDuration}
          </Text>
        </View>
      ) : null}

      {payload.items.map((item, i) => (
        // Each phase row is atomic — never sliced across a page break.
        <View
          key={i}
          wrap={false}
          style={{
            flexDirection: "row",
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: cardBorderColor(dark),
          }}
        >
          <View style={{ width: "30%", paddingRight: 12 }}>
            <Text style={{ fontSize: theme.typography.bodySize, fontWeight: 700, color: strongColor(dark), marginBottom: 3 }}>
              {item.phase}
            </Text>
            <Text style={{ fontSize: theme.typography.bodySize - 1, fontWeight: 600, color: theme.colors.accent }}>
              {item.duration}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: theme.typography.bodySize - 0.5, color: mutedColor(dark), lineHeight: 1.6 }}>
              {item.description}
            </Text>
            {(item.revisions || item.expectedDelivery) ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 5 }}>
                {item.revisions ? (
                  <Text style={{ fontSize: theme.typography.bodySize - 1.5, color: faintColor(dark), marginRight: 14 }}>
                    Revisões: {item.revisions}
                  </Text>
                ) : null}
                {item.expectedDelivery ? (
                  <Text style={{ fontSize: theme.typography.bodySize - 1.5, color: faintColor(dark) }}>
                    Entrega: {item.expectedDelivery}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      ))}

      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
