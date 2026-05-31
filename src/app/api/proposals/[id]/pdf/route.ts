import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { ProposalDocument, type ProposalPdfData } from "@/services/pdf/ProposalDocument"
import { brandingService } from "@/services/branding.service"
import { handleServiceError } from "@/utils/serviceError"
import { logger } from "@/lib/logger"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params

    // Verify ownership
    const proposal = await prisma.proposal.findFirst({
      where: { id, userId: user.sub },
    })

    if (!proposal) {
      return NextResponse.json({ success: false, message: "Proposal not found" }, { status: 404 })
    }

    if (!proposal.generatedText && !proposal.generatedProposalJson) {
      return NextResponse.json(
        { success: false, message: "Proposal has no generated content yet. Generate it first." },
        { status: 422 }
      )
    }

    // Parse generated content
    let generated: ProposalPdfData["generated"] | null = null

    if (proposal.generatedProposalJson) {
      try { generated = JSON.parse(proposal.generatedProposalJson) } catch {}
    }

    if (!generated && proposal.generatedText) {
      try {
        const legacy = JSON.parse(proposal.generatedText)
        // Adapt legacy format to premium format
        generated = adaptLegacyFormat(legacy, proposal.clientName, proposal.projectType)
      } catch {}
    }

    if (!generated) {
      return NextResponse.json(
        { success: false, message: "Could not parse proposal content" },
        { status: 422 }
      )
    }

    // Fetch branding
    const branding = await brandingService.getBrandingContext(user.sub)

    const pdfData: ProposalPdfData = {
      id:          proposal.id,
      clientName:  proposal.clientName,
      projectType: proposal.projectType,
      city:        proposal.city,
      style:       proposal.style,
      createdAt:   proposal.createdAt.toISOString(),
      generated,
      branding,
    }

    // Generate PDF buffer
    const buffer = await renderToBuffer(
      React.createElement(ProposalDocument, { data: pdfData })
    )

    const filename = `proposta-${proposal.clientName.toLowerCase().replace(/\s+/g, "-")}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length":      buffer.length.toString(),
        "Cache-Control":       "no-store",
      },
    })
  } catch (error) {
    logger.error({ err: error }, "[pdf] generation failed")
    return handleServiceError(error)
  }
})

// ─── Adapter: legacy GeneratedProposal → premium ProposalPdfData["generated"] ─

function adaptLegacyFormat(
  legacy: Record<string, unknown>,
  clientName: string,
  projectType: string,
): ProposalPdfData["generated"] {
  const tl = (legacy.timeline as { phase: string; duration: string; description: string }[]) ?? []

  return {
    cover: {
      title:       (legacy.title as string) ?? `Proposta — ${clientName}`,
      subtitle:    `Projeto de ${projectType}`,
      projectType,
      city:        "",
      style:       "",
    },
    summary: {
      title:   "Resumo Executivo",
      content: (legacy.project_summary as string) ?? "",
    },
    clientUnderstanding: {
      title:   "Entendimento das suas Necessidades",
      content: (legacy.client_needs as string) ?? (legacy.client_greeting as string) ?? "",
    },
    architecturalDirection: {
      title:   "Direção Arquitetônica",
      content: (legacy.architectural_direction as string) ?? (legacy.scope_description as string) ?? "",
    },
    objectives: (legacy.objectives as string[])?.map((o) => ({ title: o, description: "" })) ?? [],
    scope: {
      included: (legacy.deliverables as string[])?.map((d) => ({ item: d, description: "" })) ?? [],
      excluded: (legacy.excluded_items as string[]) ?? [],
    },
    stages: tl.map((t, i) => ({
      number:       i + 1,
      name:         t.phase,
      duration:     t.duration,
      description:  t.description,
      deliverables: [],
    })),
    timeline: tl.map((t) => ({
      phase:       t.phase,
      duration:    t.duration,
      description: t.description,
    })),
    investment: {
      pricingMethod:     "A definir",
      estimatedValue:    "A confirmar",
      paymentConditions: [
        "30% na assinatura do contrato",
        "40% na entrega do anteprojeto",
        "30% na entrega final",
      ],
    },
    differentials: (legacy.differentials as { title: string; description: string }[]) ?? [],
    risks:          (legacy.risks as { risk: string; mitigation: string; severity: "low" | "medium" | "high" }[]) ?? [],
    finalConsiderations: {
      title:   "Considerações Finais",
      content: (legacy.closing as string) ?? "",
    },
  }
}
