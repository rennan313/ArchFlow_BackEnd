import { z } from "zod"
import type { ProposalStatus } from "@prisma/client"

export const ProposalStatusEnum = z.enum([
  "DRAFT",
  "REVIEW",
  "SENT",
  "NEGOTIATION",
  "APPROVED",
  "REJECTED",
])

export const updateStatusSchema = z.object({
  status: ProposalStatusEnum,
  force:  z.boolean().optional().default(false), // manual override
})

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>

// ─── Valid transitions ────────────────────────────────────────────────────────

const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT:       ["REVIEW", "SENT"],
  REVIEW:      ["DRAFT", "SENT"],
  SENT:        ["NEGOTIATION", "APPROVED", "REJECTED"],
  NEGOTIATION: ["APPROVED", "REJECTED", "SENT"],
  APPROVED:    [],
  REJECTED:    ["DRAFT"],
}

export function isValidTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function getAllowedTransitions(from: ProposalStatus): ProposalStatus[] {
  return TRANSITIONS[from] ?? []
}

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT:       "Rascunho",
  REVIEW:      "Em Revisão",
  SENT:        "Enviada",
  NEGOTIATION: "Em Negociação",
  APPROVED:    "Aprovada",
  REJECTED:    "Rejeitada",
}
