/**
 * scripts/seed-billing-plan-versions-v1.ts
 *
 * Entitlements Sprint (2026-07), Phase 2 — supersedes prisma/seed-billing-
 * plans.ts (now a deprecation stub pointing here). Seeds the new blueprint
 * pricing as version:1, status:ACTIVE BillingPlan rows for
 * STARTER/PROFESSIONAL, and a DRAFT placeholder for ENTERPRISE
 * (contact-sales, never auto-sellable via self-serve checkout).
 *
 * STUDIO gets NO v1 counterpart — per the confirmed migration decision,
 * existing Studio subscribers are reassigned to Enterprise by
 * scripts/migrate-workspaces-to-plan-versions.ts, not grandfathered on a
 * frozen Studio version.
 *
 * MUST run together with (immediately before) `prisma db push` in any
 * environment that already has BillingPlan rows from before this schema
 * change — pre-existing rows are missing `version`, `status`, and the
 * renamed limit fields entirely (Mongo is schemaless; the old schema never
 * wrote them), and Prisma throws on any hydrated read (findMany, findUnique)
 * of a document missing a non-optional field. Step 1 below (deprecate) uses
 * `updateMany` specifically because it does NOT need to hydrate the old
 * documents into the new type — a `findMany` against pre-migration rows
 * would throw first. Do not run this against a database whose schema hasn't
 * been pushed with the Entitlements Sprint's BillingPlan changes yet.
 *
 * Idempotent — re-running finds the version:1 rows already present
 * ([key,version] match) and refreshes them in place rather than duplicating.
 *
 * Usage:
 *   npx tsx scripts/seed-billing-plan-versions-v1.ts
 */

import { PrismaClient, type Plan, type FeatureKey, type PlanVersionStatus } from "@prisma/client"

const prisma = new PrismaClient()

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

interface PlanVersionSeed {
  key: Plan
  name: string
  description: string
  priceMonthly: number
  priceAnnual: number
  limitSeats: number
  limitActiveProjects: number
  limitProposalsPerCycle: number
  limitAiCreditsPerCycle: number
  limitStorageBytes: bigint
  features: FeatureKey[]
  status: PlanVersionStatus
  order: number
}

const STARTER_FEATURES: FeatureKey[] = ["CRM", "AGENDA", "PROJECTS", "FINANCE", "PURCHASES", "WORKLOG", "PDF_EXPORT", "BRANDING_BASIC"]
const PROFESSIONAL_FEATURES: FeatureKey[] = [...STARTER_FEATURES, "CUSTOM_BRANDING", "WHITE_LABEL", "AUTOMATIONS", "RBAC", "MOODBOARDS"]
const ENTERPRISE_FEATURES: FeatureKey[] = [...PROFESSIONAL_FEATURES, "API", "ANALYTICS"]

// Annual price = the figures already published/live before this sprint —
// today's numbers become the annual price; the monthly figures are net-new
// (blueprint §8, confirmed reading — DP10).
const PLAN_VERSIONS: PlanVersionSeed[] = [
  {
    key: "STARTER", name: "Starter",
    description: "Para arquitetos autônomos começando a organizar o escritório.",
    priceMonthly: 99.9, priceAnnual: 1018.8,
    limitSeats: 4, limitActiveProjects: 10, limitProposalsPerCycle: 20, limitAiCreditsPerCycle: 20,
    limitStorageBytes: BigInt(500 * MB),
    features: STARTER_FEATURES, status: "ACTIVE", order: 0,
  },
  {
    key: "PROFESSIONAL", name: "Professional",
    description: "Para escritórios em crescimento que precisam de mais capacidade e branding.",
    priceMonthly: 139.9, priceAnnual: 1428,
    limitSeats: 10, limitActiveProjects: 200, limitProposalsPerCycle: 150, limitAiCreditsPerCycle: 80,
    limitStorageBytes: BigInt(5 * GB),
    features: PROFESSIONAL_FEATURES, status: "ACTIVE", order: 1,
  },
  {
    key: "ENTERPRISE", name: "Enterprise",
    description: "Soluções sob medida para grandes operações — fale com o time comercial.",
    priceMonthly: 0, priceAnnual: 0,
    limitSeats: -1, limitActiveProjects: -1, limitProposalsPerCycle: -1, limitAiCreditsPerCycle: 200,
    limitStorageBytes: -1n,
    features: ENTERPRISE_FEATURES, status: "DRAFT", order: 2,
  },
]

async function main() {
  // 1. Deprecate every pre-existing row (old key-unique rows, missing
  //    `version` entirely in Mongo — `{ not: 1 }` matches "missing" too,
  //    same as Mongo's native $ne). updateMany deliberately, not findMany —
  //    see the file-level comment on why.
  const deprecated = await prisma.billingPlan.updateMany({
    where: { version: { not: 1 } },
    data: { status: "DEPRECATED" },
  })
  console.log(`Deprecated ${deprecated.count} pre-existing BillingPlan row(s) (including any STUDIO row — no v1 counterpart is created for it).`)

  for (const seed of PLAN_VERSIONS) {
    const { key, ...data } = seed
    await prisma.billingPlan.upsert({
      where: { key_version: { key, version: 1 } },
      create: { key, version: 1, ...data },
      update: data,
    })
    console.log(`✓ BillingPlan seeded: ${key} v1 (${seed.status})`)
  }

  console.log(`\nDone — ${PLAN_VERSIONS.length} plan versions seeded (v1).`)
  console.log("NOTE: mpPreapprovalPlanIdMonthly/Annual are NOT set by this script.")
  console.log("If a deprecated version had one configured, update the Mercado Pago")
  console.log("dashboard to match the new v1 prices (or leave preapproval plan ids")
  console.log("unset so checkout charges the inline amount from priceMonthly/priceAnnual above).")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
