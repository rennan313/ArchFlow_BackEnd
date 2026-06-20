/**
 * backfill-subscriptions.ts
 *
 * Phase 1 billing foundation migration: creates a Subscription row for every
 * Workspace that doesn't have one yet. Idempotent — safe to run multiple
 * times; workspaces that already have a Subscription are skipped.
 *
 * Rule: workspaces already on a paid plan (anything above STARTER) get
 * status=ACTIVE with a full current period starting now. Workspaces on
 * STARTER get status=TRIALING with a 14-day trial — they're being granted a
 * trial retroactively rather than assumed to have exhausted one, since no
 * trial concept existed before this migration.
 *
 * Usage:
 *   npx tsx scripts/backfill-subscriptions.ts            (dry run — no writes)
 *   npx tsx scripts/backfill-subscriptions.ts --execute   (writes for real)
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const EXECUTE = process.argv.includes("--execute")
const TRIAL_DURATION_DAYS = 14

async function main() {
  console.log(`Subscription backfill — ${EXECUTE ? "EXECUTE (writing)" : "DRY RUN (no writes)"}\n`)

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, plan: true, subscription: { select: { id: true } } },
  })

  const missing = workspaces.filter((w) => !w.subscription)

  console.log(`Total workspaces:              ${workspaces.length}`)
  console.log(`Already have a Subscription:   ${workspaces.length - missing.length}`)
  console.log(`Missing a Subscription:        ${missing.length}\n`)

  if (missing.length === 0) {
    console.log("Nothing to backfill.")
    await prisma.$disconnect()
    return
  }

  let trialing = 0
  let active   = 0

  for (const ws of missing) {
    const now = new Date()
    const isStarter = ws.plan === "STARTER"

    if (isStarter) trialing++
    else active++

    console.log(
      `  ${ws.id}  "${ws.name}"  plan=${ws.plan}  -> ${isStarter ? "TRIALING (14d trial)" : "ACTIVE"}`,
    )

    if (!EXECUTE) continue

    const trialEndsAt = isStarter
      ? new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
      : null

    await prisma.subscription.create({
      data: {
        workspaceId:        ws.id,
        plan:               ws.plan,
        status:             isStarter ? "TRIALING" : "ACTIVE",
        billingCycle:       "MONTHLY",
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd:   trialEndsAt ?? null,
      },
    })
  }

  console.log(`\n— Plan: ${trialing} TRIALING, ${active} ACTIVE`)
  console.log(EXECUTE ? "\nDone — Subscriptions created." : "\nDry run only — re-run with --execute to write.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
