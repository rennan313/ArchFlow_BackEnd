import type { RenderDocument, ThemeTokens } from "@/types/proposal-render-model"

// ─── Etapa 4 — PDF abstraction ──────────────────────────────────────────────
// The renderer never imports @react-pdf/renderer directly — only through
// this interface. Swapping PDF engines (or adding a DOCX adapter against the
// same RenderDocument in a future phase) means writing a new adapter, not
// touching ProposalRendererService or anything upstream of it.
export interface PdfAdapter {
  render(doc: RenderDocument, theme: ThemeTokens): Promise<Buffer>
}
