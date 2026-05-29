export type PlanName = "STARTER" | "PROFESSIONAL" | "STUDIO" | "ENTERPRISE"

export interface PlanLimits {
  maxUsers:             number   // -1 = unlimited
  maxProposalsPerMonth: number   // -1 = unlimited
  maxStorageMb:         number   // -1 = unlimited
  canCustomBranding:    boolean
  canExportPdf:         boolean
  canApiAccess:         boolean
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  STARTER: {
    maxUsers:             1,
    maxProposalsPerMonth: 20,
    maxStorageMb:         500,
    canCustomBranding:    false,
    canExportPdf:         false,
    canApiAccess:         false,
  },
  PROFESSIONAL: {
    maxUsers:             5,
    maxProposalsPerMonth: -1,
    maxStorageMb:         5000,
    canCustomBranding:    true,
    canExportPdf:         true,
    canApiAccess:         false,
  },
  STUDIO: {
    maxUsers:             -1,
    maxProposalsPerMonth: -1,
    maxStorageMb:         -1,
    canCustomBranding:    true,
    canExportPdf:         true,
    canApiAccess:         true,
  },
  ENTERPRISE: {
    maxUsers:             -1,
    maxProposalsPerMonth: -1,
    maxStorageMb:         -1,
    canCustomBranding:    true,
    canExportPdf:         true,
    canApiAccess:         true,
  },
}

export const PLAN_LABELS: Record<PlanName, string> = {
  STARTER:      "Starter",
  PROFESSIONAL: "Professional",
  STUDIO:       "Studio",
  ENTERPRISE:   "Enterprise",
}

export function unlimited(n: number) { return n === -1 }
