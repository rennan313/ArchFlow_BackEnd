// RC-3.3 — backfills the new denormalized Payment.projectId for existing
// rows. Same per-row pattern as RC-2.2's idempotencyKey/direction backfill
// (installment.repository.ts's `financialDocument.direction` precedent) —
// `$lookup` is not a valid stage inside an update pipeline (MongoDB rejects
// it: "code 72, $lookup is not allowed to be used within an update"), so a
// single-command bulk rewrite isn't available here. Fine for this migration's
// actual data volume (pre-launch dev/staging data, not a live production
// backfill at hundreds of thousands of rows — see docs/financial-architecture.md
// §11 for why that scale is exactly the case this sprint fixed for reads).
//
// Run AFTER `prisma db push` applies the new (nullable) Payment.projectId
// field — unlike RC-2.2's idempotencyKey backfill, there's no unique-index
// ordering constraint here, since projectId is nullable and not unique.
import { prisma } from "@/lib/prisma"

async function main() {
  const payments = await prisma.payment.findMany({ select: { id: true, installmentId: true, projectId: true } })
  console.log(`Backfilling projectId for ${payments.length} existing payment(s)...`)

  let updated = 0
  for (const p of payments) {
    if (p.projectId !== null && p.projectId !== undefined) continue // already backfilled

    const installment = await prisma.installment.findUnique({
      where: { id: p.installmentId },
      select: { financialDocument: { select: { projectId: true } } },
    })
    if (!installment) throw new Error(`Payment ${p.id}: installment ${p.installmentId} not found`)

    await prisma.payment.update({ where: { id: p.id }, data: { projectId: installment.financialDocument.projectId } })
    updated++
  }

  console.log(`Done. Updated ${updated} payment(s).`)
}

main().catch((err) => { console.error(err); process.exitCode = 1 }).finally(() => prisma.$disconnect())
