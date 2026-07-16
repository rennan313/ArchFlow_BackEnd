// RC-2.2 — one-time migration: converts existing Int32 money fields to
// Int64 (BigInt) in place, and backfills the two new required Payment
// fields (idempotencyKey, direction) introduced by RC-2.1/RC-2.5 — both
// needed BEFORE `prisma db push` builds the new unique index on
// idempotencyKey (a non-sparse unique index over documents all missing the
// field would fail to build with more than one existing row).
//
// Run BEFORE `prisma db push` applies the new schema/indexes, using the
// OLD generated client (still Int-typed at this point) plus $runCommandRaw
// for the actual BSON type conversion, which bypasses Prisma's typed layer
// entirely — safe regardless of what the .prisma file currently says.
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

async function convertInt32ToInt64(collection: string, field: string) {
  const result = await prisma.$runCommandRaw({
    update: collection,
    updates: [{ q: {}, u: [{ $set: { [field]: { $toLong: `$${field}` } } }], multi: true }],
  })
  console.log(`${collection}.${field} ->`, JSON.stringify(result))
}

async function backfillPaymentDirectionAndIdempotencyKey() {
  const payments = await prisma.payment.findMany({ select: { id: true, installmentId: true } })
  console.log(`Backfilling ${payments.length} existing payment(s)...`)

  for (const p of payments) {
    const installment = await prisma.installment.findUnique({
      where: { id: p.installmentId },
      select: { financialDocument: { select: { direction: true } } },
    })
    const direction = installment?.financialDocument.direction
    if (!direction) throw new Error(`Payment ${p.id}: could not resolve direction via installment ${p.installmentId}`)

    const result = await prisma.$runCommandRaw({
      update: "payments",
      updates: [{
        q: { _id: { $oid: p.id } },
        u: { $set: { direction, idempotencyKey: randomUUID() } },
      }],
    })
    console.log(`  payment ${p.id} -> direction=${direction}`, JSON.stringify(result))
  }
}

async function main() {
  console.log("=== Step 1: backfill Payment.direction / idempotencyKey ===")
  await backfillPaymentDirectionAndIdempotencyKey()

  console.log("\n=== Step 2: convert Int32 -> Int64 for money fields ===")
  await convertInt32ToInt64("bank_accounts", "initialBalanceCents")
  await convertInt32ToInt64("financial_documents", "totalAmountCents")
  await convertInt32ToInt64("installments", "amountCents")
  await convertInt32ToInt64("payments", "amountCents")

  console.log("\nDone. Safe to run `prisma db push` now.")
}

main().catch((err) => { console.error(err); process.exitCode = 1 }).finally(() => prisma.$disconnect())
