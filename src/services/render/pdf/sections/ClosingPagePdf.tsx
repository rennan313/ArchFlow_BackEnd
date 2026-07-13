import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeClosing } from "@/types/proposal-premium-narrative"
import type { RenderDocument } from "@/types/proposal-render-model"
import { Footer, SectionHeader, mutedColor, faintColor, strongColor, cardBorderColor, type TypedSectionPageContext } from "../pdf-shared"

export function ClosingPagePdf({
  payload, doc, ctx,
}: {
  payload: PremiumNarrativeClosing
  doc:     RenderDocument
  ctx:     TypedSectionPageContext
}) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx

  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />

      <View style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.accent, paddingLeft: 16, marginTop: 8, marginBottom: 24 }}>
        {payload.message.split("\n\n").map((paragraph, i) => (
          <Text
            key={i}
            style={{ fontSize: theme.typography.bodySize + 1, color: mutedColor(dark), lineHeight: 2, marginBottom: 14 }}
          >
            {paragraph.trim()}
          </Text>
        ))}
      </View>

      {/* Contact block — the "how to reach us" companion to the approval CTA */}
      <View wrap={false} style={{ borderWidth: 1, borderColor: cardBorderColor(dark), borderRadius: 4, padding: 16 }}>
        <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: faintColor(dark), marginBottom: 8 }}>
          Fale conosco
        </Text>
        <Text style={{ fontSize: theme.typography.bodySize + 0.5, fontWeight: 700, color: strongColor(dark), marginBottom: 3 }}>
          {doc.footer.officeName ?? "—"}
        </Text>
        {doc.cover.architectName ? (
          <Text style={{ fontSize: theme.typography.bodySize - 0.5, color: mutedColor(dark), marginBottom: 2 }}>
            {doc.cover.architectName}{doc.cover.cauNumber ? ` · CAU ${doc.cover.cauNumber}` : ""}
          </Text>
        ) : null}
        {doc.footer.contact ? (
          <Text style={{ fontSize: theme.typography.bodySize - 0.5, color: mutedColor(dark) }}>
            {doc.footer.contact}
          </Text>
        ) : null}
      </View>

      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
