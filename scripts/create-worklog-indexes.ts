/**
 * create-worklog-indexes.ts
 *
 * Creates the sparse unique index documented in docs/indexes.md ("Worklog V3
 * — work_sessions.activeOwnerId Sparse Unique Index", ADR-024) — same
 * pattern as create-billing-indexes.ts. Idempotent — safe to run multiple
 * times, in any environment (uses DATABASE_URL). Does not touch
 * schema.prisma (Prisma's @unique on Mongo isn't sparse, so this field
 * intentionally has no @unique there — see the field comment in
 * schema.prisma).
 *
 * Also drops the pre-V3 time_entries.activeOwnerId index, if present — that
 * field no longer exists on TimeEntry (ADR-024 moved the invariant to
 * WorkSession), so the old index is dead weight once this runs.
 *
 * ⚠ Verify DATABASE_URL before running this against anything but local dev —
 * see docs/backend "DATABASE_URL danger" note (a duplicate env var once
 * pointed local dev at production Mongo). This script writes index metadata
 * only, never document data, but still confirm the target database first.
 *
 * Usage:
 *   npx tsx scripts/create-worklog-indexes.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function createIndex(collection: string, key: string, name: string) {
  const result = await prisma.$runCommandRaw({
    createIndexes: collection,
    indexes: [{ key: { [key]: 1 }, name, unique: true, sparse: true }],
  })
  console.log(`✓ ${collection}.${key} →`, JSON.stringify(result))
}

async function dropIndexIfExists(collection: string, name: string) {
  try {
    const result = await prisma.$runCommandRaw({ dropIndexes: collection, index: name })
    console.log(`✓ dropped ${collection}.${name} →`, JSON.stringify(result))
  } catch (e) {
    console.log(`- ${collection}.${name} not present, nothing to drop (${(e as Error).message})`)
  }
}

async function main() {
  await createIndex("work_sessions", "activeOwnerId", "work_sessions_activeOwnerId_sparse_unique")
  await dropIndexIfExists("time_entries", "time_entries_activeOwnerId_sparse_unique")
  console.log("\nDone — Worklog V3 sparse index ensured, pre-V3 index dropped if present.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
