/**
 * seed-billing-plans.ts — DEPRECATED (Entitlements Sprint, 2026-07)
 *
 * Superseded by scripts/seed-billing-plan-versions-v1.ts. BillingPlan is now
 * versioned ([key, version] unique, see prisma/schema.prisma), and the
 * limit* fields this script wrote (limitProjects/limitUsers/limitAiMonthly/
 * limitUploadsMb) were renamed (limitSeats/limitActiveProjects/
 * limitProposalsPerCycle/limitAiCreditsPerCycle/limitStorageBytes) and
 * config/plans.ts is no longer the seed input for pricing/limits — the new
 * script hardcodes the approved blueprint pricing directly (config/plans.ts
 * still exists for other legacy consumers, not as billing's source of truth
 * anymore).
 *
 * Kept in place (not deleted) only so `npx tsx prisma/seed-billing-plans.ts`
 * fails loudly instead of silently writing stale-shaped data if anyone runs
 * it out of habit.
 *
 * Usage:
 *   npx tsx scripts/seed-billing-plan-versions-v1.ts
 */

console.error(
  "prisma/seed-billing-plans.ts is deprecated and no longer compatible with " +
  "the versioned BillingPlan schema (Entitlements Sprint, 2026-07).\n" +
  "Run scripts/seed-billing-plan-versions-v1.ts instead.",
)
process.exit(1)
