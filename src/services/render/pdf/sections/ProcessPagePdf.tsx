import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeProcess, PremiumNarrativeNextSteps } from "@/types/proposal-premium-narrative"
import { Footer, SectionHeader, mutedColor, strongColor, cardBorderColor, type TypedSectionPageContext } from "../pdf-shared"

// Vertical timeline row: numbered badge + connecting line (absolute-
// positioned View — react-pdf's SVG support is too limited for the web
// version's SVG connector) + name/description. wrap={false} keeps each row
// atomic across page breaks.
function TimelineRow({
  order, name, description, isLast, ctx,
}: {
  order: number
  name: string
  description?: string
  isLast: boolean
  ctx: TypedSectionPageContext
}) {
  const { theme, dark } = ctx
  return (
    <View wrap={false} style={{ flexDirection: "row", position: "relative" }}>
      {/* Badge column with connector line below the badge */}
      <View style={{ width: 40, alignItems: "center" }}>
        <View
          style={{
            width: 24, height: 24, borderRadius: 12,
            borderWidth: 1.2, borderColor: theme.colors.accent,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: 700, color: theme.colors.accent }}>{order}</Text>
        </View>
        {!isLast && (
          <View style={{ position: "absolute", top: 26, bottom: -2, width: 1, backgroundColor: cardBorderColor(dark) }} />
        )}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 18, paddingLeft: 6 }}>
        <Text style={{ fontSize: theme.typography.bodySize + 1, fontWeight: 700, color: strongColor(dark), marginBottom: 3 }}>
          {name}
        </Text>
        {description ? (
          <Text style={{ fontSize: theme.typography.bodySize - 0.5, color: mutedColor(dark), lineHeight: 1.6 }}>
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function ProcessPagePdf({ payload, ctx }: { payload: PremiumNarrativeProcess; ctx: TypedSectionPageContext }) {
  const { styles, dark, pageNum, footerLabel } = ctx
  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />
      <View style={{ marginTop: 6 }}>
        {payload.steps.map((step, i) => (
          <TimelineRow
            key={step.name}
            order={step.order}
            name={step.name}
            description={step.description}
            isLast={i === payload.steps.length - 1}
            ctx={ctx}
          />
        ))}
      </View>
      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}

export function NextStepsPagePdf({ payload, ctx }: { payload: PremiumNarrativeNextSteps; ctx: TypedSectionPageContext }) {
  const { styles, dark, pageNum, footerLabel } = ctx
  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />
      <View style={{ marginTop: 6 }}>
        {payload.steps.map((step, i) => (
          <TimelineRow
            key={step.name}
            order={step.order}
            name={step.name}
            description={step.description}
            isLast={i === payload.steps.length - 1}
            ctx={ctx}
          />
        ))}
      </View>
      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
