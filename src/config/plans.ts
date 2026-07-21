// Single source of truth for plan definitions — Phase 1 of the billing
// foundation. Previously this file only carried enforcement limits; the
// frontend had its own separate definition (ArchFlow/src/config/pricing.ts)
// with different plan IDs (lowercase, 3 plans) and richer pricing/feature
// fields. That divergence is the duplication this file now resolves: this
// is the one place plan content is defined, enriched to be a strict superset
// of what both sides previously had.
//
// The frontend's config/pricing.ts is intentionally left untouched in this
// phase (see Phase 1 billing report) — it still drives the live UI
// (BillingClient.tsx, landing Pricing) under its own 3-plan/lowercase-id
// shape. Wiring the frontend to fetch from this file instead is deferred to
// the phase that's allowed to touch UI-adjacent code.

export type PlanName = "STARTER" | "PROFESSIONAL" | "STUDIO" | "ENTERPRISE"

export interface PlanLimits {
  maxUsers:             number   // -1 = unlimited
  maxProposalsPerMonth: number   // -1 = unlimited
  maxStorageMb:         number   // -1 = unlimited
  canCustomBranding:    boolean
  canExportPdf:         boolean
  canApiAccess:         boolean
  // Added in Phase 1 — previously only present in the frontend's pricing.ts
  maxProjects:          number   // -1 = unlimited
  aiCreditsPerMonth:    number   // -1 = unlimited
  canMoodboards:        boolean
  canAnalytics:         boolean
  canPrioritySupport:   boolean
  canSlaSupport:        boolean
}

export interface PlanPricing {
  // null = custom/contact-sales pricing (ENTERPRISE) — not yet a number
  // anyone has confirmed; treat as a placeholder until sales defines it.
  monthlyPrice:       number | null
  annualTotal:        number | null
  annualMonthlyEquiv: number | null
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  STARTER: {
    maxUsers:             1,
    maxProposalsPerMonth: 20,
    maxStorageMb:         500,
    canCustomBranding:    false,
    canExportPdf:         false,
    canApiAccess:         false,
    maxProjects:          10,
    aiCreditsPerMonth:    20,
    canMoodboards:        false,
    canAnalytics:         false,
    canPrioritySupport:   false,
    canSlaSupport:        false,
  },
  PROFESSIONAL: {
    // maxUsers stays 5 here (the value already enforced in production),
    // not the frontend pricing.ts's old value of 3 — this file wins as the
    // canonical source, per the Phase 1 billing audit decision.
    maxUsers:             5,
    maxProposalsPerMonth: -1,
    maxStorageMb:         5000,
    canCustomBranding:    true,
    canExportPdf:         true,
    canApiAccess:         false,
    maxProjects:          -1,
    aiCreditsPerMonth:    200,
    canMoodboards:        true,
    canAnalytics:         false,
    canPrioritySupport:   true,
    canSlaSupport:        false,
  },
  STUDIO: {
    maxUsers:             -1,
    maxProposalsPerMonth: -1,
    maxStorageMb:         -1,
    canCustomBranding:    true,
    canExportPdf:         true,
    canApiAccess:         true,
    maxProjects:          -1,
    aiCreditsPerMonth:    1000,
    canMoodboards:        true,
    canAnalytics:         true,
    canPrioritySupport:   true,
    canSlaSupport:        true,
  },
  ENTERPRISE: {
    maxUsers:             -1,
    maxProposalsPerMonth: -1,
    maxStorageMb:         -1,
    canCustomBranding:    true,
    canExportPdf:         true,
    canApiAccess:         true,
    maxProjects:          -1,
    aiCreditsPerMonth:    -1,
    canMoodboards:        true,
    canAnalytics:         true,
    canPrioritySupport:   true,
    canSlaSupport:        true,
  },
}

export const PLAN_LABELS: Record<PlanName, string> = {
  STARTER:      "Starter",
  PROFESSIONAL: "Professional",
  STUDIO:       "Studio",
  ENTERPRISE:   "Enterprise",
}

// STARTER/PROFESSIONAL updated to the Vincel commercial pricing (was the
// old ArchFlow-era R$59/R$99). Annual keeps the same ~15% discount policy
// the old figures used (STARTER 50/59≈15.25% off, PROFESSIONAL 84/99≈15.15%
// off) — see VINCEL_LANDING_AUDIT.md §E for the full pricing-sync chain
// (this file → prisma/seed-billing-plans.ts → BillingPlan table → Mercado
// Pago Preapproval Plan, which does NOT read this value and must be updated
// separately or the amount charged won't match what's displayed).
// STUDIO carries over unchanged — not part of the new Starter/Professional/
// Enterprise commercial narrative, no new price given for it.
export const PLAN_PRICING: Record<PlanName, PlanPricing> = {
  STARTER:      { monthlyPrice: 99.9, annualTotal: 1018.8, annualMonthlyEquiv: 84.9 },
  PROFESSIONAL: { monthlyPrice: 140,  annualTotal: 1428,   annualMonthlyEquiv: 119 },
  STUDIO:       { monthlyPrice: 199,  annualTotal: 2028,   annualMonthlyEquiv: 169 },
  ENTERPRISE:   { monthlyPrice: null, annualTotal: null,   annualMonthlyEquiv: null },
}

export function unlimited(n: number) { return n === -1 }
