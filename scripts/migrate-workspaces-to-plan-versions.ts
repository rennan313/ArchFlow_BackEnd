/**
 * scripts/migrate-workspaces-to-plan-versions.ts
 *
 * Entitlements Sprint (2026-07), Phase 3. For every workspace/subscription
 * missing Subscription.planVersionId:
 *
 *   - Already ACTIVE with a real Mercado Pago subscription (mpSubscriptionId
 *     set) -> SKIP entirely, untouched. A real paying customer's plan/price
 *     is never silently reassigned by a migration script.
 *   - Workspace.plan === STUDIO -> reassign to ENTERPRISE (confirmed
 *     decision: Studio has no v1 counterpart; existing Studio subscribers
 *     become Enterprise). planVersionId points at the Enterprise v1 row
 *     even though its status is DRAFT (DRAFT only means "not self-serve
 *     sellable to new signups" — a direct migration grant is not a
 *     checkout, so that's fine).
 *   - Everything else -> "Professional courtesy for 60 days" (confirmed
 *     decision): planVersionId = Professional v1, currentPeriodEnd = now +
 *     60 days. The downgrade-at-period-end machinery (Phase 5, not yet
 *     implemented) is what falls the workspace back to its nominal plan
 *     once this window lapses — this script only sets up the courtesy
 *     period, it does not implement that fallback.
 *
 * Then grants one initial cycle of AI credits per migrated workspace
 * (idempotent by construction — same idempotencyKey/cycleKey shape as
 * aiCredit.repository.ts#grantCycle, safe to re-run).
 *
 * Idempotent overall: skips any Subscription that already has
 * planVersionId set. No `@/` imports (scripts run via `npx tsx` outside the
 * Next.js build — same self-contained convention as every other script in
 * this directory).
 *
 * Usage:
 *   npx tsx scripts/migrate-workspaces-to-plan-versions.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")
const COURTESY_DAYS = 60

async function findPlanVersionId(key: "PROFESSIONAL" | "ENTERPRISE"): Promise<string> {
  const plan = await prisma.billingPlan.findFirst({ where: { key, version: 1 } })
  if (!plan) throw new Error(`BillingPlan ${key} v1 not found — run scripts/seed-billing-plan-versions-v1.ts first`)
  return plan.id
}

async function grantInitialCycle(workspaceId: string, subscriptionId: string, amount: number, periodStart: Date, periodEnd: Date) {
  if (amount <= 0) return // ENTERPRISE has AI credits but a workspace assigned via Studio migration inherits whatever ENTERPRISE grants below
  const cycleKey = `sub_${subscriptionId}:${periodStart.toISOString()}`
  const idempotencyKey = `grant:${workspaceId}:${cycleKey}`

  const already = await prisma.aiCreditLedgerEntry.findUnique({ where: { idempotencyKey } })
  if (already) return

  await prisma.$transaction(async (tx) => {
    const balance = await tx.aiCreditBalance.upsert({
      where: { workspaceId_bucket: { workspaceId, bucket: "PLAN" } },
      create: { workspaceId, bucket: "PLAN", balance: amount, expiresAt: periodEnd },
      update: { balance: { increment: amount }, expiresAt: periodEnd },
    })
    await tx.aiCreditLedgerEntry.create({
      data: {
        workspaceId, bucket: "PLAN", reason: "GRANT_CYCLE", amount,
        balanceAfter: balance.balance, idempotencyKey, cycleKey,
      },
    })
  })
}

async function main() {
  const professionalId = await findPlanVersionId("PROFESSIONAL")
  const enterpriseId = await findPlanVersionId("ENTERPRISE")
  const enterprisePlan = await prisma.billingPlan.findUniqueOrThrow({ where: { id: enterpriseId } })
  const professionalPlan = await prisma.billingPlan.findUniqueOrThrow({ where: { id: professionalId } })

  // `where: { planVersionId: null }` does NOT match documents where the
  // field is structurally absent (every pre-Entitlements-Sprint Subscription
  // row) — confirmed against production: the same Prisma-on-Mongo filter-
  // translation gap already hit in scripts/seed-billing-plan-versions-v1.ts
  // (a `select` read correctly normalizes an absent field to `null`, but a
  // `where` filter does not treat absent-vs-null as equivalent the way raw
  // Mongo would). The collection is small (tens of workspaces, not
  // thousands) — fetching all and filtering in JS sidesteps the bug
  // entirely instead of fighting the query translator again.
  const allSubscriptions = await prisma.subscription.findMany({
    include: { workspace: { select: { id: true, plan: true } } },
  })
  const subscriptions = allSubscriptions.filter((s) => s.planVersionId === null)

  console.log(`Found ${subscriptions.length} subscription(s) without planVersionId (of ${allSubscriptions.length} total).`)

  let skippedPaying = 0
  let migratedStudio = 0
  let migratedCourtesy = 0

  for (const sub of subscriptions) {
    // ANY real Mercado Pago linkage — not just status:ACTIVE — is left
    // untouched. A workspace can have mpSubscriptionId set while still
    // TRIAL (checkout started, webhook authorization hasn't landed yet);
    // silently courtesy-assigning it would risk stamping the wrong
    // currentPeriodEnd right before the real webhook activates it for real.
    const hasRealGatewayLink = !!sub.mpSubscriptionId
    if (hasRealGatewayLink) {
      skippedPaying++
      console.log(`SKIP (has a real Mercado Pago subscription, status=${sub.status}): workspace ${sub.workspaceId}, plan ${sub.workspace.plan}`)
      continue
    }

    const now = new Date()

    if (sub.workspace.plan === "STUDIO") {
      migratedStudio++
      console.log(`${DRY_RUN ? "[dry-run] " : ""}Studio -> Enterprise: workspace ${sub.workspaceId}`)
      if (!DRY_RUN) {
        await prisma.$transaction(async (tx) => {
          await tx.workspace.update({ where: { id: sub.workspaceId }, data: { plan: "ENTERPRISE" } })
          await tx.subscription.update({
            where: { id: sub.id },
            data: { plan: "ENTERPRISE", planVersionId: enterpriseId },
          })
        })
        // Enterprise's period is left as-is (no courtesy window — it's the
        // permanent replacement for Studio, not a promotional trial) unless
        // currentPeriodStart/End were never set (legacy data gap) — filled
        // in defensively so downstream cycle math never divides by an
        // undefined period.
        const periodStart = sub.currentPeriodStart ?? now
        const periodEnd = sub.currentPeriodEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        await grantInitialCycle(sub.workspaceId, sub.id, enterprisePlan.limitAiCreditsPerCycle, periodStart, periodEnd)
      }
      continue
    }

    migratedCourtesy++
    const periodEnd = new Date(now.getTime() + COURTESY_DAYS * 24 * 60 * 60 * 1000)
    console.log(`${DRY_RUN ? "[dry-run] " : ""}Professional courtesy (${COURTESY_DAYS}d): workspace ${sub.workspaceId} (nominal plan: ${sub.workspace.plan})`)
    if (!DRY_RUN) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          planVersionId: professionalId,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      })
      await grantInitialCycle(sub.workspaceId, sub.id, professionalPlan.limitAiCreditsPerCycle, now, periodEnd)
    }
  }

  console.log(`\nDone${DRY_RUN ? " (dry-run, nothing written)" : ""} — ${skippedPaying} skipped (paying), ${migratedStudio} Studio->Enterprise, ${migratedCourtesy} Professional courtesy.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
