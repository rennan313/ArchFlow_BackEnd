import { projectRepository } from "@/repositories/project.repository"
import { proposalSectionRepository } from "@/repositories/proposal-section.repository"
import { proposalBlockRepository } from "@/repositories/proposal-block.repository"
import { proposalTemplateRepository } from "@/repositories/proposal-template.repository"
import { classifyProject, recommendSkin } from "@/services/ai/proposal-advisor-classifier"
import { pickBestBlock, MAX_BLOCK_SCORE } from "@/services/ai/proposal-advisor-scoring"
import { AppError, ErrorCode } from "@/lib/errors"
import type { ProposalAdviceResult, RecommendedBlock } from "@/types/proposal-advisor"

function buildSignalText(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" \n ").toLowerCase()
}

export const proposalAdvisorService = {
  async advise(projectId: string, workspaceId: string): Promise<ProposalAdviceResult> {
    const project = await projectRepository.findByIdForAdvisor(projectId, workspaceId)
    if (!project) throw new AppError(ErrorCode.PROJECT_NOT_FOUND)

    const proposal = project.proposal
    const briefing  = project.opportunity?.briefing

    const signalText = buildSignalText([
      project.name, project.description, project.notes,
      proposal?.projectObjective, proposal?.spaceUsage, proposal?.currentProblems, proposal?.priorities, proposal?.budget, proposal?.timeline, proposal?.meetingNotes, proposal?.style,
      briefing?.projectObjective, briefing?.spaceUsage, briefing?.currentProblems, briefing?.priorities, briefing?.budget, briefing?.timeline, briefing?.meetingNotes, briefing?.desiredStyle,
    ])

    const classification = classifyProject({
      projectType:    project.type,
      squareMeters:   project.squareMeters ?? null,
      complexity:     proposal?.complexity ?? null,
      contractValue:  project.contractValue ?? proposal?.estimatedTotal ?? null,
      signalText,
    })

    const recommendedSkin = recommendSkin(classification.narrativeProfile, classification.projectTypeCategory, classification.investmentTier)

    const [{ data: allSections }, { data: templates }] = await Promise.all([
      proposalSectionRepository.findMany(workspaceId, { page: 1, limit: 50, archived: false }),
      proposalTemplateRepository.findMany(workspaceId, { page: 1, limit: 50, archived: false }),
    ])
    // Migration-only sections (Investimento, Riscos, etc.) exist solely for
    // legacy-migration.service.ts to snapshot old proposals into — the
    // advisor must never recommend them for a brand-new proposal. Same for
    // the premium-flow-only sections: those are created only by the premium
    // initialize() path, always all 12 at once, never picked à la carte.
    const sections = allSections.filter((s) => !s.isMigrationOnly && !s.isPremiumFlowOnly)

    const recommendedSections: string[] = []
    const recommendedBlocks: Record<string, RecommendedBlock> = {}
    const reasoning: string[] = [
      `Categoria do projeto: ${classification.projectTypeCategory}`,
      `Faixa de investimento: ${classification.investmentTier}`,
      `Perfil narrativo: ${classification.narrativeProfile}`,
    ]

    let scoreSum = 0
    let scoredSections = 0

    for (const section of sections) {
      recommendedSections.push(section.key)

      const { data: candidates } = await proposalBlockRepository.findMany(workspaceId, {
        page: 1, limit: 100, sectionKey: section.key, archived: false,
      })

      const best = pickBestBlock(candidates, classification)
      if (!best) {
        reasoning.push(`Nenhum bloco disponível para "${section.name}" — biblioteca incompleta para esta seção.`)
        continue
      }

      recommendedBlocks[section.key] = { blockId: best.block.id, name: best.block.name, score: best.score }
      reasoning.push(`"${best.block.name}" selecionado para "${section.name}" (score ${best.score}/${MAX_BLOCK_SCORE}).`)
      scoreSum += best.score
      scoredSections++
    }

    const template = templates.find((t) => t.skin === recommendedSkin) ?? templates[0] ?? null
    const confidence = scoredSections > 0 ? Math.round((scoreSum / (scoredSections * MAX_BLOCK_SCORE)) * 100) : 0

    return {
      recommendedTemplateId: template?.id ?? null,
      recommendedTemplate:   template?.name ?? null,
      recommendedSkin,
      recommendedNarrative:  classification.narrativeProfile,
      recommendedSections,
      recommendedBlocks,
      reasoning,
      confidence,
      classification: {
        projectTypeCategory: classification.projectTypeCategory,
        investmentTier:      classification.investmentTier,
      },
    }
  },
}
