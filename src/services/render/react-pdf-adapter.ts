import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { RenderDocumentPdf } from "@/services/render/pdf/RenderDocumentPdf"
import type { PdfAdapter } from "@/services/render/pdf-adapter"
import type { RenderDocument, ThemeTokens } from "@/types/proposal-render-model"

export const reactPdfAdapter: PdfAdapter = {
  async render(doc: RenderDocument, theme: ThemeTokens): Promise<Buffer> {
    return renderToBuffer(React.createElement(RenderDocumentPdf, { doc, theme }))
  },
}
