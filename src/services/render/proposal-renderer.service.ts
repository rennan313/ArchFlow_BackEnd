import { snapshotLoaderService } from "@/services/render/snapshot-loader.service"
import { mapSnapshotToRenderDocument } from "@/services/render/render-model-mapper"
import { themeEngine } from "@/services/render/theme-engine"
import { reactPdfAdapter } from "@/services/render/react-pdf-adapter"
import type { RenderDocument } from "@/types/proposal-render-model"

// ─── Etapa 1-4 — the single entry point every export format calls ─────────
// Routes (PDF today; DOCX/web-preview/share-link later) call this, never
// SnapshotLoader/Mapper/ThemeEngine/PdfAdapter directly. This is also the
// only place that knows a PdfAdapter implementation exists at all.
export const proposalRendererService = {
  async buildRenderDocument(proposalId: string, workspaceId: string): Promise<RenderDocument> {
    const snapshot = await snapshotLoaderService.load(proposalId, workspaceId)
    return mapSnapshotToRenderDocument(snapshot)
  },

  async renderToPdf(proposalId: string, workspaceId: string): Promise<{ buffer: Buffer; doc: RenderDocument }> {
    const doc = await this.buildRenderDocument(proposalId, workspaceId)
    const theme = themeEngine.resolve(doc.metadata.skin)
    const buffer = await reactPdfAdapter.render(doc, theme)
    return { buffer, doc }
  },
}
