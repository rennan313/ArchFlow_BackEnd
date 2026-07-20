/**
 * create-worklog-indexes.ts
 *
 * Creates the sparse unique index documented in docs/indexes.md ("Worklog —
 * time_entries.activeOwnerId Sparse Unique Index", ADR-021) — same pattern as
 * create-billing-indexes.ts. Idempotent — safe to run multiple times, in any
 * environment (uses DATABASE_URL). Does not touch schema.prisma (Prisma's
 * @unique on Mongo isn't sparse, so this field intentionally has no @unique
 * there — see the field comment in schema.prisma).
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

async function main() {
  await createIndex("time_entries", "activeOwnerId", "time_entries_activeOwnerId_sparse_unique")
  console.log("\nDone — Worklog sparse index ensured.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
