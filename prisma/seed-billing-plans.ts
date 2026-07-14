/**
 * seed-billing-plans.ts
 *
 * Seeds the BillingPlan table (Sprint 09, Story 3) from the code config that
 * already exists — config/plans.ts is the enforcement source of truth for
 * limits, and PLAN_PRICING for prices. This table adds the persisted, sellable
 * display layer + the Mercado Pago plan mapping, without ever becoming a second
 * source of enforcement limits. Upsert-by-key: re-running refreshes name/price/
 * limits from config but PRESERVES the mp* ids you fill in from the MP dashboard
 * (they're only written when the incoming value is non-null).
 *
 * ENTERPRISE is contact-sales (null price in config) → seeded with price 0 and
 * active:false so it never renders as a self-serve, checkout-able plan.
 *
 * Usage:
 *   npx tsx prisma/seed-billing-plans.ts
 */

import { PrismaClient, type Plan } from "@prisma/client"
import { PLAN_LIMITS, PLAN_PRICING, PLAN_LABELS, type PlanName } from "@/config/plans"

const prisma = new PrismaClient()

// Display/sell order + one-line marketing description per tier. Kept here (not
// in config/plans.ts) because it's presentation copy, not enforcement.
const PLAN_META: Record<PlanName, { order: number; description: string; sellable: boolean }> = {
  STARTER:      { order: 0, description: "Para arquitetos autônomos começando a organizar o escritório.", sellable: true },
  PROFESSIONAL: { order: 1, description: "Para escritórios em crescimento que precisam de mais capacidade e branding.", sellable: true },
  STUDIO:       { order: 2, description: "Para estúdios estabelecidos — tudo ilimitado e suporte prioritário.", sellable: true },
  ENTERPRISE:   { order: 3, description: "Soluções sob medida para grandes operações — fale com o time comercial.", sellable: false },
}

async function main() {
  const keys = Object.keys(PLAN_LIMITS) as PlanName[]

  for (const key of keys) {
    const limits  = PLAN_LIMITS[key]
    const pricing = PLAN_PRICING[key]
    const meta    = PLAN_META[key]

    await prisma.billingPlan.upsert({
      where:  { key: key as Plan },
      create: {
        key:            key as Plan,
        name:           PLAN_LABELS[key],
        description:    meta.description,
        priceMonthly:   pricing.monthlyPrice ?? 0,
        priceAnnual:    pricing.annualTotal ?? 0,
        limitProjects:  limits.maxProjects,
        limitUsers:     limits.maxUsers,
        limitAiMonthly: limits.aiCreditsPerMonth,
        limitUploadsMb: limits.maxStorageMb,
        active:         meta.sellable,
        order:          meta.order,
      },
      // Refresh display/limit mirror on every run — but never clobber the mp*
      // ids (omitted here, so upsert.update leaves them untouched).
      update: {
        name:           PLAN_LABELS[key],
        description:    meta.description,
        priceMonthly:   pricing.monthlyPrice ?? 0,
        priceAnnual:    pricing.annualTotal ?? 0,
        limitProjects:  limits.maxProjects,
        limitUsers:     limits.maxUsers,
        limitAiMonthly: limits.aiCreditsPerMonth,
        limitUploadsMb: limits.maxStorageMb,
        active:         meta.sellable,
        order:          meta.order,
      },
    })

    console.log(`✓ BillingPlan upserted: ${key}`)
  }

  console.log(`\nDone — ${keys.length} billing plans seeded.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
