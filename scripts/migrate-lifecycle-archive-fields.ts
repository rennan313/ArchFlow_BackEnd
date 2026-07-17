/**
 * migrate-lifecycle-archive-fields.ts
 *
 * Entity Lifecycle finalization (ADR-020): backfills the new `archived` /
 * `archivedAt` / `archivedBy` trio from the legacy per-entity flags being
 * retired — `isActive` (Supplier, BankAccount) and `isArchived`
 * (SupplierCategory, CostCenter, FinancialCategory, ProposalTemplate,
 * ProposalSection, ProposalBlock, ProposalNarrative).
 *
 * `isActive` has INVERTED semantics vs. the new field: isActive:false means
 * archived:true. Every other legacy flag maps 1:1 (isArchived:true ==
 * archived:true).
 *
 * `archivedAt` has no real historical value to recover — the legacy flags
 * never recorded when they flipped — so this uses the record's own
 * `updatedAt` as the best available approximation (the flip was very likely
 * the last write to the row). `archivedBy` is always set to null: there is
 * no historical actor to attribute, and null is exactly what an unknown
 * archivedBy should read as going forward.
 *
 * Idempotent — only touches rows where the legacy flag indicates "archived"
 * AND the new `archived` field isn't already true, so re-running after a
 * partial run or after new records were created via the new fields is safe.
 *
 * IMPORTANT — why this reads via `$runCommandRaw` instead of the typed
 * Prisma client: `prisma/schema.prisma` already dropped `isActive`/
 * `isArchived` from these nine models (ADR-020 shipped straight to the
 * renamed fields, not an additive-then-cleanup two-step) — the generated
 * Prisma Client has no idea these fields ever existed and will reject any
 * typed query that references them. MongoDB itself is schemaless, so any
 * document written before this migration still physically carries the old
 * field in its BSON, untouched, regardless of what the client declares.
 * Raw commands are the only way to read that legacy data back out; writes
 * use the typed client normally since `archived`/`archivedAt`/`archivedBy`
 * are current schema fields.
 *
 * Usage:
 *   npx tsx scripts/migrate-lifecycle-archive-fields.ts            (dry run — no writes)
 *   npx tsx scripts/migrate-lifecycle-archive-fields.ts --execute   (writes for real)
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const EXECUTE = process.argv.includes("--execute")

// Large enough to return every row in one batch for any realistic pre-launch
// volume (ENGINEERING_STANDARDS.md §5 — "poucos milhares de linhas: loop por
// linha é aceitável"); avoids needing cursor.getMore continuation logic for
// a script this narrowly scoped. If a future environment has more rows than
// this in a single one of these nine collections, that's itself a signal
// this script needs the cursor-continuation version before re-running.
const RAW_BATCH_SIZE = 100_000

interface RawRow {
  _id: { $oid: string }
  updatedAt: { $date: string }
}

interface FindRawResult {
  cursor: { firstBatch: RawRow[] }
}

/** Legacy-field find via raw command — the only way to read a field the
 *  typed Prisma Client no longer declares. */
async function findLegacyRaw(collection: string, filter: Record<string, unknown>): Promise<RawRow[]> {
  const result = await prisma.$runCommandRaw({
    find: collection,
    filter,
    projection: { _id: 1, updatedAt: 1 },
    batchSize: RAW_BATCH_SIZE,
  }) as unknown as FindRawResult
  return result.cursor.firstBatch
}

/** Legacy-field count via raw command — same reasoning as findLegacyRaw. */
async function countLegacyRaw(collection: string, filter: Record<string, unknown>): Promise<number> {
  const result = await prisma.$runCommandRaw({ count: collection, query: filter }) as unknown as { n: number }
  return result.n
}

interface Job {
  label: string
  collection: string
  /** Raw filter expressing "legacy flag says archived, new field not yet
   *  flipped" for this entity — both halves matter for the parity check:
   *  after a successful run, this exact filter must match zero rows.
   *  `archived: { $ne: true }` (not `archived: false`) deliberately, because
   *  real legacy rows predate the ADR-020 migration and don't have an
   *  `archived` field at all — a strict `false` equality match silently
   *  skips every document where the field is simply absent, which is the
   *  common case for genuinely old data (MongoDB does not treat a missing
   *  field as equal to `false`, only to `null`). */
  legacyArchivedFilter: Record<string, unknown>
  applyArchived: (id: string, archivedAt: Date) => Promise<unknown>
}

const jobs: Job[] = [
  {
    label: "Supplier (isActive:false -> archived:true, INVERTED)",
    collection: "suppliers",
    legacyArchivedFilter: { isActive: false, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.supplier.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "BankAccount (isActive:false -> archived:true, INVERTED)",
    collection: "bank_accounts",
    legacyArchivedFilter: { isActive: false, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.bankAccount.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "SupplierCategory (isArchived -> archived)",
    collection: "supplier_categories",
    legacyArchivedFilter: { isArchived: true, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.supplierCategory.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "CostCenter (isArchived -> archived)",
    collection: "cost_centers",
    legacyArchivedFilter: { isArchived: true, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.costCenter.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "FinancialCategory (isArchived -> archived)",
    collection: "financial_categories",
    legacyArchivedFilter: { isArchived: true, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.financialCategory.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "ProposalTemplate (isArchived -> archived)",
    collection: "proposal_templates",
    legacyArchivedFilter: { isArchived: true, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.proposalTemplate.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "ProposalSection (isArchived -> archived)",
    collection: "proposal_sections",
    legacyArchivedFilter: { isArchived: true, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.proposalSection.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "ProposalBlock (isArchived -> archived)",
    collection: "proposal_blocks",
    legacyArchivedFilter: { isArchived: true, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.proposalBlock.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
  {
    label: "ProposalNarrative (isArchived -> archived)",
    collection: "proposal_narratives",
    legacyArchivedFilter: { isArchived: true, archived: { $ne: true } },
    applyArchived: (id, archivedAt) =>
      prisma.proposalNarrative.update({ where: { id }, data: { archived: true, archivedAt, archivedBy: null } }),
  },
]

async function main() {
  console.log(`Entity Lifecycle field migration — ${EXECUTE ? "EXECUTE (writing)" : "DRY RUN (no writes)"}\n`)

  let totalMismatches = 0

  for (const job of jobs) {
    const pending = await findLegacyRaw(job.collection, job.legacyArchivedFilter)
    console.log(`${job.label}: ${pending.length} row(s) to backfill`)

    if (EXECUTE) {
      for (const row of pending) {
        await job.applyArchived(row._id.$oid, new Date(row.updatedAt.$date))
      }

      // Parity check: re-run the EXACT same filter ("legacy says archived,
      // new field still false") — a successful backfill means this now
      // matches zero rows. Deliberately not comparing against a raw count of
      // `archived: true` overall, which would also include rows archived
      // through the new flow that never had the legacy flag at all, and
      // would false-positive a mismatch on every re-run after real usage.
      const remaining = await countLegacyRaw(job.collection, job.legacyArchivedFilter)
      if (remaining > 0) {
        totalMismatches++
        console.error(`  MISMATCH: ${remaining} row(s) still match the legacy-archived filter after migration`)
      } else {
        console.log(`  OK: 0 rows remaining under the legacy filter`)
      }
    }
  }

  if (EXECUTE && totalMismatches > 0) {
    console.error(`\n${totalMismatches} entit(y/ies) failed the before/after parity check — investigate before removing legacy fields.`)
    process.exitCode = 1
    return
  }

  console.log(EXECUTE ? "\nDone — archived/archivedAt/archivedBy backfilled." : "\nDry run only — re-run with --execute to write.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
