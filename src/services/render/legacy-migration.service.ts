import { proposalSectionInstanceRepository } from "@/repositories/proposal-section-instance.repository"
import { proposalSectionRepository } from "@/repositories/proposal-section.repository"
import { proposalRepository } from "@/repositories/proposal.repository"
import type { Proposal } from "@prisma/client"

// ─── Etapa 6 — one-time legacy migration ───────────────────────────────────
//
// Converts a pre-Editor proposal's generatedProposalJson (the fixed-shape
// PremiumProposal blob — see types/proposal-generation.ts) into real
// ProposalSectionInstance rows, so it can be opened, edited, and exported
// through the exact same pipeline as proposals created after the Editor
// existed. Runs lazily, at most once per proposal: SnapshotLoader calls this
// only when a proposal has zero section instances yet. After it runs,
// generatedProposalJson is left untouched on the Proposal row (kept for
// history/audit per the Fase 2.0 rules) but is never read again — the
// migrated instances become the proposal's only source of truth from then on.

interface LegacyPremiumProposal {
  cover?: { title?: string; subtitle?: string }
  summary?: { title?: string; content?: string }
  clientUnderstanding?: { title?: string; content?: string }
  architecturalDirection?: { title?: string; content?: string }
  objectives?: { title: string; description: string }[]
  scope?: { included?: { item: string; description: string }[]; excluded?: string[] }
  stages?: { number: number; name: string; duration: string; description: string; deliverables?: string[] }[]
  timeline?: { phase: string; duration: string; description: string; milestone?: string }[]
  investment?: { pricingMethod?: string; estimatedValue?: string; paymentConditions?: string[] }
  differentials?: { title: string; description: string }[]
  risks?: { risk: string; mitigation: string; severity?: string }[]
  finalConsiderations?: { title?: string; content?: string }
}

function joinParagraphs(...parts: (string | undefined | null)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n")
}

function formatObjectives(items: LegacyPremiumProposal["objectives"]): string {
  if (!items?.length) return ""
  return items.map((o) => joinParagraphs(`• ${o.title}`, o.description)).join("\n\n")
}

function formatScope(scope: LegacyPremiumProposal["scope"]): string {
  if (!scope) return ""
  const included = (scope.included ?? []).map((i) => joinParagraphs(`✓ ${i.item}`, i.description)).join("\n\n")
  const excluded = scope.excluded?.length ? `\n\nNão incluído:\n${scope.excluded.map((e) => `- ${e}`).join("\n")}` : ""
  return `${included}${excluded}`
}

function formatStagesTimeline(stages: LegacyPremiumProposal["stages"], timeline: LegacyPremiumProposal["timeline"]): string {
  const stagesText = (stages ?? [])
    .map((s) => joinParagraphs(`${s.number}. ${s.name} (${s.duration})`, s.description, s.deliverables?.length ? `Entregáveis: ${s.deliverables.join(", ")}` : undefined))
    .join("\n\n")
  const timelineText = (timeline ?? [])
    .map((t) => joinParagraphs(`${t.phase} — ${t.duration}`, t.description, t.milestone ? `Marco: ${t.milestone}` : undefined))
    .join("\n\n")
  return joinParagraphs(stagesText, timelineText)
}

function formatInvestment(inv: LegacyPremiumProposal["investment"]): string {
  if (!inv) return ""
  const header = joinParagraphs(
    inv.pricingMethod ? `Método: ${inv.pricingMethod}` : undefined,
    inv.estimatedValue ? `Valor estimado: ${inv.estimatedValue}` : undefined,
  )
  const conditions = inv.paymentConditions?.length
    ? `\n\nCondições de pagamento:\n${inv.paymentConditions.map((c) => `- ${c}`).join("\n")}`
    : ""
  return `${header}${conditions}`
}

function formatDifferentials(items: LegacyPremiumProposal["differentials"]): string {
  if (!items?.length) return ""
  return items.map((d) => joinParagraphs(`• ${d.title}`, d.description)).join("\n\n")
}

function formatRisks(items: LegacyPremiumProposal["risks"]): string {
  if (!items?.length) return ""
  return items.map((r) => joinParagraphs(`• ${r.risk}`, r.mitigation ? `Mitigação: ${r.mitigation}` : undefined)).join("\n\n")
}

export const legacyMigrationService = {
  /** True if this proposal has legacy content but no Editor instances yet. */
  needsMigration(proposal: Proposal, instanceCount: number): boolean {
    return instanceCount === 0 && Boolean(proposal.generatedProposalJson || proposal.generatedText)
  },

  /** Idempotent: re-checks instance count itself, so concurrent callers never duplicate. */
  async migrate(proposal: Proposal, workspaceId: string): Promise<void> {
    const existing = await proposalSectionInstanceRepository.findByProposal(proposal.id, workspaceId)
    if (existing.length > 0) return // another caller already migrated it

    const raw = proposal.generatedProposalJson ?? proposal.generatedText
    if (!raw) return

    let legacy: LegacyPremiumProposal
    try {
      legacy = JSON.parse(raw)
    } catch {
      return // corrupted snapshot — nothing to migrate from, caller falls back to empty
    }

    const fields: Array<{ sectionKey: string; title: string; content: string }> = [
      { sectionKey: "executive-summary",      title: legacy.summary?.title ?? "Resumo Executivo",                content: legacy.summary?.content ?? "" },
      { sectionKey: "client-understanding",   title: legacy.clientUnderstanding?.title ?? "Entendimento das Necessidades", content: legacy.clientUnderstanding?.content ?? "" },
      { sectionKey: "architectural-direction", title: legacy.architecturalDirection?.title ?? "Direção Arquitetônica",     content: legacy.architecturalDirection?.content ?? "" },
      { sectionKey: "objectives",             title: "Objetivos do Projeto", content: formatObjectives(legacy.objectives) },
      { sectionKey: "scope",                  title: "Escopo do Projeto",    content: formatScope(legacy.scope) },
      { sectionKey: "stages-timeline",        title: "Etapas e Cronograma",  content: formatStagesTimeline(legacy.stages, legacy.timeline) },
      { sectionKey: "investment",             title: "Investimento",        content: formatInvestment(legacy.investment) },
      { sectionKey: "differentials",          title: "Diferenciais",        content: formatDifferentials(legacy.differentials) },
      { sectionKey: "risks",                  title: "Pontos de Atenção",   content: formatRisks(legacy.risks) },
      { sectionKey: "closing",                title: legacy.finalConsiderations?.title ?? "Considerações Finais", content: legacy.finalConsiderations?.content ?? "" },
    ].filter((f) => f.content.trim().length > 0) // skip fields the legacy proposal never populated

    const { data: catalog } = await proposalSectionRepository.findMany(workspaceId, { page: 1, limit: 50, isArchived: false })
    const sectionByKey = new Map(catalog.map((s) => [s.key, s]))

    await Promise.all(
      fields.map(async (field, index) => {
        const section = sectionByKey.get(field.sectionKey)
        if (!section) return // shouldn't happen — seeded alongside the curated catalog
        await proposalSectionInstanceRepository.create(workspaceId, {
          proposalId:         proposal.id,
          sectionId:          section.id,
          blockId:            null,
          sortOrder:          index,
          title:              field.title,
          content:            field.content,
          createdFromLibrary: false,
          isCustomized:       false,
        })
      }),
    )

    await proposalRepository.update(proposal.id, workspaceId, { builderStatus: "BUILDING" })
  },
}

