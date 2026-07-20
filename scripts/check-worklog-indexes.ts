/**
 * check-worklog-indexes.ts
 *
 * MEL-02 (Worklog Sprint V2) — read-only verification that the manually
 * created sparse unique index documented in docs/indexes.md ("Worklog —
 * time_entries.activeOwnerId Sparse Unique Index", ADR-021) actually exists
 * in whichever database DATABASE_URL points to. Does NOT create or alter
 * anything — schema.prisma intentionally has no @unique on activeOwnerId
 * (Prisma's @unique on Mongo isn't sparse) and this script must never change
 * that. If the index is missing, this only reports it clearly so it can be
 * created via the documented mongosh command before it's relied upon.
 *
 * Usage:
 *   npx tsx scripts/check-worklog-indexes.ts
 *
 * Exit code: 0 if the index exists with the expected shape, 1 otherwise —
 * safe to wire into a deploy-time check without extra parsing.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const EXPECTED = {
  collection: "time_entries",
  field: "activeOwnerId",
  name: "time_entries_activeOwnerId_sparse_unique",
}

interface RawIndex {
  name: string
  key: Record<string, number>
  unique?: boolean
  sparse?: boolean
}

async function main() {
  console.log(`Checking ${EXPECTED.collection}.${EXPECTED.field} for a sparse unique index...\n`)

  const result = await prisma.$runCommandRaw({ listIndexes: EXPECTED.collection }) as {
    cursor?: { firstBatch?: RawIndex[] }
  }
  const indexes = result.cursor?.firstBatch ?? []

  const match = indexes.find((idx) => idx.key && Object.keys(idx.key).length === 1 && idx.key[EXPECTED.field] !== undefined)

  if (!match) {
    console.error(`✗ MISSING — no index found on "${EXPECTED.field}" in "${EXPECTED.collection}".`)
    console.error(`  Existing indexes: ${indexes.map((i) => i.name).join(", ") || "(none)"}`)
    console.error(`\n  Create it before relying on "one active timer per user" in this`)
    console.error(`  environment — see docs/indexes.md, "Worklog — time_entries.activeOwnerId`)
    console.error(`  Sparse Unique Index":\n`)
    console.error(`    db.${EXPECTED.collection}.createIndex(`)
    console.error(`      { ${EXPECTED.field}: 1 },`)
    console.error(`      { unique: true, sparse: true, name: "${EXPECTED.name}" }`)
    console.error(`    )`)
    process.exitCode = 1
    return
  }

  const isUnique = match.unique === true
  const isSparse = match.sparse === true

  if (isUnique && isSparse) {
    console.log(`✓ OK — "${match.name}" exists with { unique: true, sparse: true }.`)
    console.log(`  The one-active-timer-per-user invariant (ADR-021) is protected by the database in this environment.`)
    process.exitCode = 0
    return
  }

  console.error(`✗ MISALIGNED — an index named "${match.name}" exists on "${EXPECTED.field}" but is not both unique and sparse:`)
  console.error(`  unique: ${match.unique ?? false}, sparse: ${match.sparse ?? false}`)
  console.error(`\n  This does NOT protect the one-active-timer-per-user invariant. Drop and`)
  console.error(`  recreate it per docs/indexes.md before relying on it in this environment.`)
  process.exitCode = 1
}

main()
  .catch((e) => { console.error("Check failed:", e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
