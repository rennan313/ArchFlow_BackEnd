/**
 * migrate-trial-status.ts
 *
 * Trial model change (30-day trial, no free tier): SubscriptionStatus.TRIALING
 * was renamed to TRIAL in the Prisma schema, and Subscription gained a new
 * trialStartedAt field. Existing rows still have the string "TRIALING" stored
 * in Mongo and no trialStartedAt — this script fixes both.
 *
 * Uses $runCommandRaw (not the typed Prisma client) because the generated
 * client no longer recognizes the old "TRIALING" literal — this lets the
 * script run safely BEFORE the new schema/code is deployed, not just after.
 *
 * Usage:
 *   npx tsx scripts/migrate-trial-status.ts            (dry run — no writes)
 *   npx tsx scripts/migrate-trial-status.ts --execute   (writes for real)
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const EXECUTE = process.argv.includes("--execute")

interface RawSubscription {
  _id: { $oid: string } | string
  status?: string
  trialStartedAt?: unknown
  createdAt?: { $date: string } | string
}

async function main() {
  console.log(`Trial status migration — ${EXECUTE ? "EXECUTE (writing)" : "DRY RUN (no writes)"}\n`)

  const trialingResult = await prisma.$runCommandRaw({
    find: "subscriptions",
    filter: { status: "TRIALING" },
  }) as { cursor?: { firstBatch?: RawSubscription[] } }
  const trialingRows = trialingResult.cursor?.firstBatch ?? []

  const missingStartedAtResult = await prisma.$runCommandRaw({
    find: "subscriptions",
    filter: { trialStartedAt: { $exists: false } },
  }) as { cursor?: { firstBatch?: RawSubscription[] } }
  const missingStartedAtRows = missingStartedAtResult.cursor?.firstBatch ?? []

  console.log(`Subscriptions with status="TRIALING":        ${trialingRows.length}`)
  console.log(`Subscriptions missing trialStartedAt:        ${missingStartedAtRows.length}\n`)

  if (trialingRows.length === 0 && missingStartedAtRows.length === 0) {
    console.log("Nothing to backfill.")
    await prisma.$disconnect()
    return
  }

  if (!EXECUTE) {
    console.log("Dry run only — re-run with --execute to write.")
    await prisma.$disconnect()
    return
  }

  const renameResult = await prisma.$runCommandRaw({
    update: "subscriptions",
    updates: [{ q: { status: "TRIALING" }, u: { $set: { status: "TRIAL" } }, multi: true }],
  }) as { nModified?: number }
  console.log(`Renamed TRIALING -> TRIAL: ${renameResult.nModified ?? 0} row(s).`)

  // trialStartedAt has no reliable historical value — createdAt is the closest
  // approximation (the row was created at trial-start time, before this
  // change introduced an explicit field for it).
  const backfillResult = await prisma.$runCommandRaw({
    update: "subscriptions",
    updates: [{
      q: { trialStartedAt: { $exists: false } },
      u: [{ $set: { trialStartedAt: "$createdAt" } }],
      multi: true,
    }],
  }) as { nModified?: number }
  console.log(`Backfilled trialStartedAt from createdAt: ${backfillResult.nModified ?? 0} row(s).`)

  console.log("\nDone.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
