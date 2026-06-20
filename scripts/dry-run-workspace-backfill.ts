/**
 * dry-run-workspace-backfill.ts
 *
 * READ-ONLY. Uses only Prisma findMany/count — no create/update/delete calls,
 * no writes of any kind to the database.
 *
 * Sizes the workspaceId backfill needed before deploying the userId→workspaceId
 * multi-tenancy fix. For each domain model, reports:
 *   - total documents
 *   - documents already correctly scoped (workspaceId present)
 *   - documents missing workspaceId whose owning user HAS a workspaceId
 *     (these are safely backfillable: workspaceId = users[userId].workspaceId)
 *   - documents missing workspaceId whose owning user has NO workspaceId either
 *     (orphaned — likely a pre-onboarding-completion user; needs a product
 *     decision, not an automatic backfill)
 *   - documents missing workspaceId whose userId doesn't resolve to any user
 *     at all (data integrity issue, independent of this migration)
 *
 * Usage:
 *   npx tsx scripts/dry-run-workspace-backfill.ts
 *
 * This is intentionally read-only — review the report before writing a
 * companion backfill-write script.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Models with a userId field that is being replaced by workspaceId as the
// tenant scope. FollowUp is intentionally excluded — it has no workspaceId
// column; it's scoped through its Opportunity relation instead.
const MODELS = ["client", "project", "opportunity", "proposal", "meeting"] as const

interface CollectionReport {
  model:                   string
  total:                   number
  alreadyScoped:           number
  missingWorkspaceId:      number
  backfillable:            number // owner user has a workspaceId
  orphanedNoUserWorkspace: number // owner user exists but has no workspaceId
  orphanedNoUser:          number // userId does not resolve to any user document
}

async function reportModel(model: (typeof MODELS)[number]): Promise<CollectionReport> {
  // @ts-expect-error -- dynamic model access by name, all five share this shape
  const delegate = prisma[model]

  const total = await delegate.count()
  // workspaceId is the FK side of an optional @relation — on this Prisma+Mongo
  // setup, filtering the scalar field name directly by null (`workspaceId: null`
  // or `{ equals: null }`) silently matches zero rows. Filtering through the
  // relation name instead (`workspace: null`) is what actually works — verified
  // empirically against a model with known-null rows before relying on it here.
  const alreadyScoped = await delegate.count({ where: { workspace: { isNot: null } } })

  const missingDocs: { userId: string }[] = await delegate.findMany({
    where:  { workspace: null },
    select: { userId: true },
  })

  const missingWorkspaceId = missingDocs.length
  if (missingWorkspaceId === 0) {
    return {
      model, total, alreadyScoped, missingWorkspaceId,
      backfillable: 0, orphanedNoUserWorkspace: 0, orphanedNoUser: 0,
    }
  }

  const userIds = [...new Set(missingDocs.map((d) => d.userId))]
  const users = await prisma.user.findMany({
    where:  { id: { in: userIds } },
    select: { id: true, workspaceId: true },
  })
  const userWorkspaceMap = new Map(users.map((u) => [u.id, u.workspaceId]))

  let backfillable = 0
  let orphanedNoUserWorkspace = 0
  let orphanedNoUser = 0

  for (const doc of missingDocs) {
    if (!userWorkspaceMap.has(doc.userId)) {
      orphanedNoUser++
    } else if (userWorkspaceMap.get(doc.userId)) {
      backfillable++
    } else {
      orphanedNoUserWorkspace++
    }
  }

  return {
    model, total, alreadyScoped, missingWorkspaceId,
    backfillable, orphanedNoUserWorkspace, orphanedNoUser,
  }
}

async function main() {
  console.log("Workspace backfill — dry run (read-only, no writes)\n")

  const reports: CollectionReport[] = []
  for (const model of MODELS) {
    reports.push(await reportModel(model))
  }

  for (const r of reports) {
    console.log(`── ${r.model} ──`)
    console.log(`  total documents:                          ${r.total}`)
    console.log(`  already scoped (workspaceId set):          ${r.alreadyScoped}`)
    console.log(`  missing workspaceId:                       ${r.missingWorkspaceId}`)
    if (r.missingWorkspaceId > 0) {
      console.log(`    -> safely backfillable:                  ${r.backfillable}`)
      console.log(`    -> orphaned (user has no workspace):      ${r.orphanedNoUserWorkspace}`)
      console.log(`    -> orphaned (userId resolves to no user): ${r.orphanedNoUser}`)
    }
    console.log("")
  }

  const totals = reports.reduce(
    (acc, r) => ({
      missing:      acc.missing + r.missingWorkspaceId,
      backfillable: acc.backfillable + r.backfillable,
      orphaned:     acc.orphaned + r.orphanedNoUserWorkspace + r.orphanedNoUser,
    }),
    { missing: 0, backfillable: 0, orphaned: 0 },
  )

  console.log("── Summary ──")
  console.log(`  Total documents needing workspaceId: ${totals.missing}`)
  console.log(`  Safely backfillable now:              ${totals.backfillable}`)
  console.log(`  Orphaned (need a product decision):   ${totals.orphaned}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
