import { proposalSectionRepository } from "@/repositories/proposal-section.repository"
import { proposalBlockRepository } from "@/repositories/proposal-block.repository"
import { classifyProject } from "@/services/ai/proposal-advisor-classifier"
import { pickBestBlock } from "@/services/ai/proposal-advisor-scoring"
import { logger } from "@/lib/logger"
import type { ProposalGenerationInput, LibraryContext } from "@/types/proposal-generation"

const PROJECT_TYPE_BY_LABEL: Record<string, string> = {
  residencial: "RESIDENTIAL",
  comercial:   "COMMERCIAL",
  reforma:     "RENOVATION",
  interiores:  "INTERIOR",
  urbanismo:   "URBAN",
  paisagismo:  "LANDSCAPE",
}

export const libraryContextService = {
  async build(workspaceId: string, input: ProposalGenerationInput): Promise<LibraryContext> {
    try {
      const { data: allSections } = await proposalSectionRepository.findMany(workspaceId, {
        page: 1, limit: 50, isArchived: false,
      })

      // Migration-only sections exist only for legacy snapshots — never use them
      // as generation reference material (same guard as the advisor service).
      const sections = allSections.filter((s) => !s.isMigrationOnly)
      if (sections.length === 0) return { sections: [] }

      const signalText = [
        input.projectObjective,
        input.spaceUsage,
        input.currentProblems,
        input.priorities,
        input.budget,
        input.style,
        input.meetingNotes,
      ].filter(Boolean).join(" ").toLowerCase()

      const projectType = PROJECT_TYPE_BY_LABEL[input.projectType.trim().toLowerCase()] ?? "RESIDENTIAL"

      const classification = classifyProject({
        projectType,
        squareMeters:  input.squareMeters ?? null,
        complexity:    input.complexity ?? null,
        contractValue: input.estimatedValue ?? null,
        signalText,
      })

      const results: LibraryContext["sections"] = []

      await Promise.all(
        sections.map(async (section) => {
          const { data: candidates } = await proposalBlockRepository.findMany(workspaceId, {
            page: 1, limit: 100, sectionKey: section.key, isArchived: false,
          })
          if (candidates.length === 0) return

          const best = pickBestBlock(candidates, classification)
          if (!best) return

          results.push({
            sectionKey:  section.key,
            sectionName: section.name,
            content:     best.block.content,
          })
        })
      )

      const keyOrder = sections.map((s) => s.key)
      results.sort((a, b) => keyOrder.indexOf(a.sectionKey) - keyOrder.indexOf(b.sectionKey))

      return { sections: results }
    } catch (err) {
      // Non-fatal: library is an enhancement, not a requirement.
      // If it fails, the AI generates without reference content — same as before.
      logger.warn({ err }, "[library-context] failed to build library context — proceeding without it")
      return { sections: [] }
    }
  },
}
