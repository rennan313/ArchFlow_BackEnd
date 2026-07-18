import { proposalRepository } from "@/repositories/proposal.repository"
import { proposalSectionInstanceRepository } from "@/repositories/proposal-section-instance.repository"
import { proposalSectionRepository } from "@/repositories/proposal-section.repository"
import { proposalBlockRepository } from "@/repositories/proposal-block.repository"
import { proposalTemplateRepository } from "@/repositories/proposal-template.repository"
import { projectRepository } from "@/repositories/project.repository"
import { mediaRepository } from "@/repositories/media.repository"
import { proposalAdvisorService } from "@/services/ai/proposal-advisor.service"
import { classifyProject, recommendSkin } from "@/services/ai/proposal-advisor-classifier"
import { premiumSectionRegenerationService } from "@/services/ai/premium-section-regeneration.service"
import { brandingService } from "@/services/branding.service"
import { synthesizeCover, mapAiOutputToPayloads, payloadTitle, plainTextSummaryFor } from "@/services/premium-narrative-mapper.service"
import { AppError, ErrorCode } from "@/lib/errors"
import type { AddSectionInstanceInput, UpdateSectionInstanceInput } from "@/validations/proposal-section-instance"
import type { ProposalGenerationInput, PremiumProposal } from "@/types/proposal-generation"
import {
  PREMIUM_NARRATIVE_SECTION_KEYS,
  parsePremiumNarrativePayload,
  tryParsePremiumNarrativeOutput,
  type PremiumNarrativeKind,
} from "@/types/proposal-premium-narrative"

// Stable placeholder for AI-generated sections — not a real library entry.
// Must be a valid 24-char hex ObjectId (Prisma @db.ObjectId enforces format),
// so we use the zero ObjectId which no real document will ever have.
const AI_GENERATED_SECTION_ID = "000000000000000000000000"

function extractSectionsFromPremiumProposal(p: PremiumProposal): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = []

  const push = (title: string, content: string | undefined) => {
    if (content?.trim()) sections.push({ title, content })
  }

  push(p.summary?.title ?? "Visão Geral", p.summary?.content)
  push(p.clientUnderstanding?.title ?? "Entendimento das Necessidades", p.clientUnderstanding?.content)
  push(p.architecturalDirection?.title ?? "Direção Arquitetônica", p.architecturalDirection?.content)

  if (p.objectives?.length) {
    const content = p.objectives.map((o) => `${o.title}\n${o.description}`).join("\n\n")
    sections.push({ title: "Objetivos do Projeto", content })
  }

  if (p.scope?.included?.length) {
    const included = p.scope.included.map((i) => `• ${i.item}: ${i.description}`).join("\n")
    const excluded = p.scope.excluded?.length
      ? `\n\nNão incluso:\n${p.scope.excluded.map((e) => `• ${e}`).join("\n")}`
      : ""
    sections.push({ title: "Escopo dos Serviços", content: included + excluded })
  }

  if (p.stages?.length) {
    const content = p.stages
      .map((s) => `Fase ${s.number} — ${s.name} (${s.duration})\n${s.description}\nEntregáveis: ${s.deliverables?.join(", ") ?? "-"}`)
      .join("\n\n")
    sections.push({ title: "Fases do Projeto", content })
  }

  if (p.investment) {
    const lines = [
      `Valor: ${p.investment.estimatedValue}`,
      `Método: ${p.investment.pricingMethod}`,
      "",
      "Condições de Pagamento:",
      ...(p.investment.paymentConditions?.map((c) => `• ${c}`) ?? []),
    ]
    sections.push({ title: "Investimento", content: lines.join("\n") })
  }

  if (p.differentials?.length) {
    const content = p.differentials.map((d) => `${d.title}\n${d.description}`).join("\n\n")
    sections.push({ title: "Nossos Diferenciais", content })
  }

  push(p.finalConsiderations?.title ?? "Próximos Passos", p.finalConsiderations?.content)

  return sections
}

async function requireProposal(proposalId: string, workspaceId: string) {
  const proposal = await proposalRepository.findById(proposalId, workspaceId)
  if (!proposal) throw new AppError(ErrorCode.NOT_FOUND)
  return proposal
}

async function buildView(proposalId: string, workspaceId: string) {
  const [proposal, instances] = await Promise.all([
    requireProposal(proposalId, workspaceId),
    proposalSectionInstanceRepository.findByProposal(proposalId, workspaceId),
  ])

  const template = proposal.builderTemplateId
    ? await proposalTemplateRepository.findById(proposal.builderTemplateId, workspaceId)
    : null

  return {
    proposal,
    template,
    narrativeProfile: proposal.builderNarrativeProfile,
    sections: instances,
  }
}

export const proposalSectionInstanceService = {
  getBuilderView(proposalId: string, workspaceId: string) {
    return buildView(proposalId, workspaceId)
  },

  async initialize(proposalId: string, workspaceId: string) {
    const proposal = await requireProposal(proposalId, workspaceId)

    const existing = await proposalSectionInstanceRepository.findByProposal(proposalId, workspaceId)
    if (existing.length > 0) return buildView(proposalId, workspaceId) // idempotent — don't duplicate

    // Atomic claim — only one concurrent request can flip DRAFT -> BUILDING.
    // A second request arriving before this one finishes will fail the claim
    // (count === 0) and just return the current view instead of also
    // creating snapshots. See proposal.repository.ts#claimForInitialize.
    const claimed = await proposalRepository.claimForInitialize(proposalId, workspaceId)
    if (!claimed) return buildView(proposalId, workspaceId)

    try {
      // ── Premium-narrative path (Fase A) ────────────────────────────────
      // generatedText written by /api/ai/generate-premium-narrative carries a
      // schemaVersion marker; both legacy PremiumProposal and this shape are
      // valid JSON objects, so the marker (not structural sniffing) is what
      // tells them apart.
      const premiumOutput = tryParsePremiumNarrativeOutput(proposal.generatedText)
      if (premiumOutput) {
        // The 12 fixed catalog rows — real ObjectIds, unlike the legacy
        // flattener's zero-ObjectId placeholder.
        const { data: allSections } = await proposalSectionRepository.findMany(workspaceId, { page: 1, limit: 100, archived: false })
        const sectionByKey = new Map(allSections.map((s) => [s.key, s]))
        const missing = PREMIUM_NARRATIVE_SECTION_KEYS.filter((k) => !sectionByKey.has(k))
        if (missing.length > 0) {
          throw new AppError(ErrorCode.PROPOSAL_SECTION_NOT_FOUND, `Premium catalog incomplete — missing: ${missing.join(", ")} (run seed-proposal-library)`)
        }

        const [project, branding, media] = await Promise.all([
          projectRepository.findByProposalId(proposalId, workspaceId),
          brandingService.getBrandingContext(workspaceId),
          mediaRepository.findAll(proposalId, workspaceId),
        ])

        const cover    = synthesizeCover(proposal, project, branding, media)
        const payloads = mapAiOutputToPayloads(premiumOutput, cover)

        await Promise.all(
          payloads.map((payload, i) =>
            proposalSectionInstanceRepository.create(workspaceId, {
              proposalId,
              sectionId:          sectionByKey.get(PREMIUM_NARRATIVE_SECTION_KEYS[i])!.id,
              blockId:            null,
              sortOrder:          i,
              title:              payloadTitle(payload),
              content:            plainTextSummaryFor(payload),
              metadata:           JSON.stringify(payload),
              createdFromLibrary: false,
              isCustomized:       false,
            })
          )
        )

        // Skin/narrative via the pure classifier functions directly — the
        // full advise() round-trip (block scoring) is meaningless for a
        // fixed 12-page flow with no library blocks.
        const signalText = [
          proposal.projectObjective, proposal.spaceUsage, proposal.currentProblems,
          proposal.priorities, proposal.budget, proposal.timeline, proposal.meetingNotes, proposal.style,
        ].filter((p): p is string => Boolean(p && p.trim())).join(" \n ").toLowerCase()

        const classification = classifyProject({
          projectType:   project?.type ?? "RESIDENTIAL",
          squareMeters:  proposal.squareMeters ?? null,
          complexity:    proposal.complexity ?? null,
          contractValue: proposal.estimatedTotal ?? null,
          signalText,
        })
        const skin = recommendSkin(classification.narrativeProfile, classification.projectTypeCategory, classification.investmentTier)

        await proposalRepository.update(proposalId, workspaceId, {
          builderNarrativeProfile: classification.narrativeProfile,
          builderSkin:             skin,
        })

        return buildView(proposalId, workspaceId)
      }

      if (proposal.generatedText) {
        // Fast path: use AI-generated content directly — no advisor round-trip needed
        let parsed: PremiumProposal | null = null
        try {
          const raw = JSON.parse(proposal.generatedText)
          if (raw && typeof raw.cover === "object") parsed = raw as PremiumProposal
        } catch { /* fall through to advisor path */ }

        if (parsed) {
          const sectionDefs = extractSectionsFromPremiumProposal(parsed)
          if (sectionDefs.length > 0) {
            await Promise.all(
              sectionDefs.map((def, i) =>
                proposalSectionInstanceRepository.create(workspaceId, {
                  proposalId,
                  sectionId:          AI_GENERATED_SECTION_ID,
                  blockId:            null,
                  sortOrder:          i,
                  title:              def.title,
                  content:            def.content,
                  createdFromLibrary: false,
                  isCustomized:       false,
                })
              )
            )
            return buildView(proposalId, workspaceId)
          }
          // parsed but all content empty — fall through to advisor
        }
      }

      // Fallback: no generatedText or unpopulated AI content — use advisor-based initialization
      const project = await projectRepository.findByProposalId(proposalId, workspaceId)
      if (!project) {
        // No linked project yet — e.g. a proposal saved via "Salvar rascunho"
        // that was never AI-generated (that path is what normally creates the
        // linked Project). The advisor needs project context to recommend
        // sections/template, so there's nothing to base a recommendation on.
        // Previously this hard-blocked the Builder with a 400
        // (PROPOSAL_PROJECT_NOT_LINKED), leaving the user with no way to open
        // a draft proposal at all. Initialize with zero section instances
        // instead — buildView() still returns a valid (empty) builder view,
        // and the user can add sections manually from the library.
        return buildView(proposalId, workspaceId)
      }

      const advice = await proposalAdvisorService.advise(project.id, workspaceId)

      const { data: sections } = await proposalSectionRepository.findMany(workspaceId, { page: 1, limit: 50, archived: false })
      const sectionByKey = new Map(sections.map((s) => [s.key, s]))

      await Promise.all(
        advice.recommendedSections.map(async (sectionKey, index) => {
          const section = sectionByKey.get(sectionKey)
          if (!section) return

          const recommended = advice.recommendedBlocks[sectionKey]
          const block = recommended ? await proposalBlockRepository.findById(recommended.blockId, workspaceId) : null

          await proposalSectionInstanceRepository.create(workspaceId, {
            proposalId,
            sectionId:          section.id,
            blockId:            block?.id ?? null,
            sortOrder:          index,
            title:              section.name,
            content:            block?.content ?? "",
            createdFromLibrary: Boolean(block),
            isCustomized:       false,
          })
        }),
      )

      await proposalRepository.update(proposalId, workspaceId, {
        builderTemplateId:       advice.recommendedTemplateId,
        builderNarrativeProfile: advice.recommendedNarrative,
        builderSkin:             advice.recommendedSkin,
      })

      return buildView(proposalId, workspaceId)
    } catch (err) {
      // Release the claim so a retry isn't permanently stuck on BUILDING
      // with zero section instances and no way back to DRAFT.
      await proposalRepository.update(proposalId, workspaceId, { builderStatus: "DRAFT" })
      throw err
    }
  },

  async addSection(proposalId: string, workspaceId: string, input: AddSectionInstanceInput) {
    await requireProposal(proposalId, workspaceId)

    // AI-generated sections use a placeholder sectionId that has no library entry.
    // Skip the library lookup for them — title and content come from the input directly.
    const isAiSection = input.sectionId === AI_GENERATED_SECTION_ID
    const section = isAiSection ? null : await proposalSectionRepository.findById(input.sectionId, workspaceId)
    if (!isAiSection && !section) throw new AppError(ErrorCode.PROPOSAL_SECTION_NOT_FOUND)

    const block = input.blockId ? await proposalBlockRepository.findById(input.blockId, workspaceId) : null
    if (input.blockId && !block) throw new AppError(ErrorCode.PROPOSAL_BLOCK_NOT_FOUND)

    // max(sortOrder)+1, not existing.length — after a removal, sortOrder is
    // no longer dense (e.g. [0,1,3,4] once index 2 is deleted), so length
    // would collide with an already-used value and leave two instances
    // sharing the same sortOrder (sort-stability undefined across refetches).
    const existing = await proposalSectionInstanceRepository.findByProposal(proposalId, workspaceId)
    const nextOrder = existing.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1

    return proposalSectionInstanceRepository.create(workspaceId, {
      proposalId,
      sectionId:          input.sectionId,
      blockId:            block?.id ?? null,
      sortOrder:          nextOrder,
      title:              input.title ?? section?.name ?? "",
      content:            input.content ?? block?.content ?? "",
      metadata:           input.metadata ?? null,
      createdFromLibrary: Boolean(block),
      isCustomized:       !block || input.title !== undefined || input.content !== undefined,
    })
  },

  async updateSection(id: string, proposalId: string, workspaceId: string, input: UpdateSectionInstanceInput) {
    const existing = await proposalSectionInstanceRepository.findById(id, workspaceId)
    if (!existing || existing.proposalId !== proposalId) throw new AppError(ErrorCode.SECTION_INSTANCE_NOT_FOUND)

    // isCustomized marks CONTENT divergence from the library/AI original —
    // a visibility toggle (isHidden-only patch, Fase B) is not customization.
    const touchesContent = input.title !== undefined || input.content !== undefined || input.metadata !== undefined
    await proposalSectionInstanceRepository.update(id, workspaceId, {
      ...input,
      ...(touchesContent && { isCustomized: true }),
    })
    return proposalSectionInstanceRepository.findById(id, workspaceId)
  },

  async removeSection(id: string, proposalId: string, workspaceId: string) {
    const existing = await proposalSectionInstanceRepository.findById(id, workspaceId)
    if (!existing || existing.proposalId !== proposalId) throw new AppError(ErrorCode.SECTION_INSTANCE_NOT_FOUND)
    await proposalSectionInstanceRepository.delete(id, workspaceId)
  },

  // Fase B — regenerates ONE typed section's AI content in place. Only
  // premium-narrative sections (parsed metadata) other than the cover are
  // regenerable; the request context is rebuilt from the proposal's own
  // briefing fields, exactly like full generation.
  async regenerateSection(id: string, proposalId: string, workspaceId: string) {
    const [proposal, existing] = await Promise.all([
      requireProposal(proposalId, workspaceId),
      proposalSectionInstanceRepository.findById(id, workspaceId),
    ])
    if (!existing || existing.proposalId !== proposalId) throw new AppError(ErrorCode.SECTION_INSTANCE_NOT_FOUND)

    const payload = parsePremiumNarrativePayload(existing.metadata)
    if (!payload) {
      throw new Error("VALIDATION:only premium-narrative sections can be regenerated")
    }
    if (payload.kind === "cover") {
      throw new Error("VALIDATION:the cover is synthesized from project data — edit it directly instead")
    }

    const input: ProposalGenerationInput = {
      clientName:       proposal.clientName,
      city:             proposal.city ?? undefined,
      state:            proposal.state ?? undefined,
      projectType:      proposal.projectType,
      squareMeters:     proposal.squareMeters ?? undefined,
      style:            proposal.style ?? undefined,
      projectObjective: proposal.projectObjective ?? undefined,
      spaceUsage:       proposal.spaceUsage ?? undefined,
      currentProblems:  proposal.currentProblems ?? undefined,
      priorities:       proposal.priorities ?? undefined,
      budget:           proposal.budget ?? undefined,
      timeline:         proposal.timeline ?? undefined,
      meetingNotes:     proposal.meetingNotes ?? undefined,
      pricingMethod:    (proposal.pricingMethod as ProposalGenerationInput["pricingMethod"]) ?? undefined,
      estimatedValue:   proposal.estimatedTotal ?? undefined,
      complexity:       (proposal.complexity as ProposalGenerationInput["complexity"]) ?? undefined,
    }

    const branding = await brandingService.getBrandingContext(workspaceId)
    const { payload: regenerated } = await premiumSectionRegenerationService.regenerate(
      input,
      payload.kind as Exclude<PremiumNarrativeKind, "cover">,
      branding ?? undefined,
    )

    // Fresh AI content is no longer "customized" — the badge resets to the
    // library/AI origin state, same as right after initialize().
    await proposalSectionInstanceRepository.update(id, workspaceId, {
      title:        payloadTitle(regenerated),
      content:      plainTextSummaryFor(regenerated),
      metadata:     JSON.stringify(regenerated),
      isCustomized: false,
    })
    return proposalSectionInstanceRepository.findById(id, workspaceId)
  },

  async reorder(proposalId: string, workspaceId: string, order: string[]) {
    await requireProposal(proposalId, workspaceId)

    const existing = await proposalSectionInstanceRepository.findByProposal(proposalId, workspaceId)
    const existingIds = new Set(existing.map((s) => s.id))
    const sameSet = order.length === existingIds.size && order.every((id) => existingIds.has(id))
    if (!sameSet) throw new AppError(ErrorCode.INVALID_REORDER)

    await proposalSectionInstanceRepository.applyOrder(order, proposalId, workspaceId)
    return proposalSectionInstanceRepository.findByProposal(proposalId, workspaceId)
  },
}
