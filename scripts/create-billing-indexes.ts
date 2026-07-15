/**
 * create-billing-indexes.ts
 *
 * Creates the sparse unique indexes documented in docs/indexes.md for the
 * billing fields (Prisma on Mongo can't express sparse uniqueness). Idempotent
 * — safe to run multiple times, in any environment (uses DATABASE_URL).
 *
 * Usage:
 *   npx tsx scripts/create-billing-indexes.ts
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
  await createIndex("subscriptions",   "mpSubscriptionId", "subscriptions_mpSubscriptionId_sparse_unique")
  await createIndex("billing_history", "mpPaymentId",      "billing_history_mpPaymentId_sparse_unique")
  console.log("\nDone — billing sparse indexes ensured.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
