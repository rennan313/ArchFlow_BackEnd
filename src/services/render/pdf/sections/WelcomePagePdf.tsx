import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { PremiumNarrativeWelcome } from "@/types/proposal-premium-narrative"
import { Footer, SectionHeader, BodyParagraphs, mutedColor, type TypedSectionPageContext } from "../pdf-shared"

export function WelcomePagePdf({ payload, ctx }: { payload: PremiumNarrativeWelcome; ctx: TypedSectionPageContext }) {
  const { styles, theme, dark, pageNum, footerLabel } = ctx
  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={payload.title} />
      {/* Accent-barred welcome message — lighter, more personal treatment
          than the generic body text */}
      <View style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.accent, paddingLeft: 16, marginTop: 8 }}>
        {payload.message.split("\n\n").map((paragraph, i) => (
          <Text
            key={i}
            style={{ fontSize: theme.typography.bodySize + 1.5, color: mutedColor(dark), lineHeight: 2, marginBottom: 14 }}
          >
            {paragraph.trim()}
          </Text>
        ))}
      </View>
      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}

export function SolutionLikePagePdf({ title, narrative, ctx }: { title: string; narrative: string; ctx: TypedSectionPageContext }) {
  const { styles, dark, pageNum, footerLabel } = ctx
  return (
    <Page size="A4" style={dark ? styles.pageDark : styles.pageLight}>
      <SectionHeader ctx={ctx} title={title} />
      <BodyParagraphs ctx={ctx} text={narrative} />
      <Footer label={footerLabel} page={pageNum} dark={dark} styles={styles} />
    </Page>
  )
}
