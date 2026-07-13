import React from "react"
import type { RenderDocument, RenderSection } from "@/types/proposal-render-model"
import type { TypedSectionPageContext } from "../pdf-shared"
import { WelcomePagePdf, SolutionLikePagePdf } from "./WelcomePagePdf"
import { ClientUnderstandingPagePdf } from "./ClientUnderstandingPagePdf"
import { ScopePagePdf } from "./ScopePagePdf"
import { ProcessPagePdf, NextStepsPagePdf } from "./ProcessPagePdf"
import { SchedulePagePdf } from "./SchedulePagePdf"
import { DeliverablesPagePdf } from "./DeliverablesPagePdf"
import { InvestmentPagePdf, ExclusionsPagePdf } from "./InvestmentPagePdf"
import { ClosingPagePdf } from "./ClosingPagePdf"

// Dispatch for the typed premium-narrative PDF pages. Returns null when the
// section has no parsed metadata (or a kind with no dedicated page — the
// cover, which enriches page 1 instead of rendering its own page), which
// tells RenderDocumentPdf to fall back to the generic section template.
export function renderTypedSectionPage(
  section: RenderSection,
  doc:     RenderDocument,
  ctx:     TypedSectionPageContext,
): React.ReactElement | null {
  const payload = section.metadata
  if (!payload) return null

  switch (payload.kind) {
    case "cover":
      // The cover payload enriches the existing page-1 cover (hero/logo) —
      // it never renders as a body page.
      return null
    case "welcome":
      return <WelcomePagePdf payload={payload} ctx={ctx} />
    case "client-understanding":
      return <ClientUnderstandingPagePdf payload={payload} ctx={ctx} />
    case "solution":
      return <SolutionLikePagePdf title={payload.title} narrative={payload.narrative} ctx={ctx} />
    case "scope":
      return <ScopePagePdf payload={payload} ctx={ctx} />
    case "process":
      return <ProcessPagePdf payload={payload} ctx={ctx} />
    case "schedule":
      return <SchedulePagePdf payload={payload} ctx={ctx} />
    case "deliverables":
      return <DeliverablesPagePdf payload={payload} ctx={ctx} />
    case "investment":
      return <InvestmentPagePdf payload={payload} ctx={ctx} />
    case "exclusions":
      return <ExclusionsPagePdf payload={payload} ctx={ctx} />
    case "next-steps":
      return <NextStepsPagePdf payload={payload} ctx={ctx} />
    case "closing":
      return <ClosingPagePdf payload={payload} doc={doc} ctx={ctx} />
  }
}
