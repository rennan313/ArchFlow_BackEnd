import type { ProjectClassification } from "@/types/proposal-advisor"

// Weights chosen so no single axis can dominate the others; keyword hits are
// capped below a single tag match so free-text signals nudge the pick
// without overriding a structural project-type/investment/narrative fit.
const NARRATIVE_MATCH_SCORE  = 30
const PROJECT_TYPE_MATCH_SCORE = 25
const INVESTMENT_MATCH_SCORE = 20
const KEYWORD_SCORE          = 10
const KEYWORD_SCORE_CAP      = 30

export const MAX_BLOCK_SCORE = NARRATIVE_MATCH_SCORE + PROJECT_TYPE_MATCH_SCORE + INVESTMENT_MATCH_SCORE + KEYWORD_SCORE_CAP

export interface ScorableBlock {
  id: string
  name: string
  projectTypeTags: string[]
  investmentTags: string[]
  narrativeProfileTags: string[]
  keywords: string[]
}

export function scoreBlock(block: ScorableBlock, classification: ProjectClassification): number {
  let score = 0

  if (block.narrativeProfileTags.includes(classification.narrativeProfile)) score += NARRATIVE_MATCH_SCORE
  if (block.projectTypeTags.includes(classification.projectTypeCategory))   score += PROJECT_TYPE_MATCH_SCORE
  if (block.investmentTags.includes(classification.investmentTier))         score += INVESTMENT_MATCH_SCORE

  const keywordHits = block.keywords.filter((k) => classification.signalText.includes(k.toLowerCase())).length
  score += Math.min(keywordHits * KEYWORD_SCORE, KEYWORD_SCORE_CAP)

  return score
}

export interface BestBlockResult<T extends ScorableBlock> {
  block: T
  score: number
}

export function pickBestBlock<T extends ScorableBlock>(blocks: T[], classification: ProjectClassification): BestBlockResult<T> | null {
  let best: BestBlockResult<T> | null = null
  for (const block of blocks) {
    const score = scoreBlock(block, classification)
    if (!best || score > best.score) best = { block, score }
  }
  return best
}
