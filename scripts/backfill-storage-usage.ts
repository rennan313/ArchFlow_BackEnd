/**
 * scripts/backfill-storage-usage.ts
 *
 * Entitlements Sprint (2026-07), Phase 3. One-time backfill of
 * WorkspaceUsage.storageUsedBytes from the real SUM of
 * ProposalMedia.sizeBytes + DocumentVersion.size, per workspace.
 *
 * Known limitation, accepted by design (not a bug to fix here): files
 * uploaded BEFORE this migration have `ProposalMedia.sizeBytes = null` —
 * that field didn't exist until this sprint, and recovering the true size
 * of every historical file would require a Supabase Storage HEAD request
 * per file (expensive, and not worth the API-call budget for a one-time
 * backfill of pre-migration data). Those files backfill as 0 bytes; the
 * resulting undercount self-corrects over time as the nightly
 * reconciliation job (storageUsageService.reconcileWorkspace, Phase 4) runs
 * and as files get re-touched. DocumentVersion.size has always existed and
 * needs no such caveat.
 *
 * Idempotent — re-running overwrites storageUsedBytes with a freshly
 * computed SUM each time (not additive), so running it twice never
 * double-counts.
 *
 * No `@/` imports — self-contained, same convention as every other script
 * in this directory (scripts run via `npx tsx` outside the Next.js build).
 *
 * Usage:
 *   npx tsx scripts/backfill-storage-usage.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  console.log(`Backfilling storage usage for ${workspaces.length} workspace(s)...`)

  let totalBytes = 0n
  let nullSizeMediaCount = 0

  for (const { id: workspaceId } of workspaces) {
    const [mediaAgg, versionAgg, nullMediaCount] = await Promise.all([
      prisma.proposalMedia.aggregate({
        where: { proposal: { workspaceId } },
        _sum: { sizeBytes: true },
      }),
      prisma.documentVersion.aggregate({
        where: { document: { workspaceId } },
        _sum: { size: true },
      }),
      prisma.proposalMedia.count({
        where: { proposal: { workspaceId }, sizeBytes: null },
      }),
    ])

    const bytes = BigInt(mediaAgg._sum.sizeBytes ?? 0) + BigInt(versionAgg._sum.size ?? 0)
    totalBytes += bytes
    nullSizeMediaCount += nullMediaCount

    await prisma.workspaceUsage.upsert({
      where: { workspaceId },
      create: { workspaceId, storageUsedBytes: bytes },
      update: { storageUsedBytes: bytes, version: { increment: 1 } },
    })

    if (bytes > 0n || nullMediaCount > 0) {
      console.log(`  workspace ${workspaceId}: ${bytes} bytes${nullMediaCount > 0 ? ` (${nullMediaCount} pre-migration media file(s) with unknown size, counted as 0)` : ""}`)
    }
  }

  console.log(`\nDone — ${totalBytes} bytes backfilled across ${workspaces.length} workspace(s).`)
  if (nullSizeMediaCount > 0) {
    console.log(`NOTE: ${nullSizeMediaCount} pre-migration ProposalMedia row(s) had no sizeBytes and were counted as 0 — see file-level comment.`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
