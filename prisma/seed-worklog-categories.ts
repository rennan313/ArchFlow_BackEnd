/**
 * seed-worklog-categories.ts
 *
 * Creates the 13 default ActivityCategory rows (WORKLOG_ARCHITECTURE_
 * DECISIONS.md) for every existing workspace — new workspaces created after
 * this seed should get the same defaults via workspace.service.ts's
 * onboarding path in a later phase; this script backfills workspaces that
 * already existed before Worklog shipped.
 *
 * Create-if-missing (matched by workspaceId + name, case-insensitive) — safe
 * to re-run; never touches a category a workspace has already renamed or
 * archived.
 *
 * Usage:
 *   npx tsx prisma/seed-worklog-categories.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const DEFAULT_CATEGORIES = [
  "Levantamento",
  "Estudo Preliminar",
  "Anteprojeto",
  "Projeto Legal",
  "Projeto Executivo",
  "Compatibilização",
  "Obra",
  "Atendimento",
  "Reunião",
  "Administração",
  "Renderização",
  "Alterações",
  "Outro",
]

async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } })
  console.log(`Seeding default activity categories for ${workspaces.length} workspace(s)...`)

  let created = 0
  for (const workspace of workspaces) {
    const existing = await prisma.activityCategory.findMany({
      where: { workspaceId: workspace.id },
      select: { name: true },
    })
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()))

    const toCreate = DEFAULT_CATEGORIES.filter((name) => !existingNames.has(name.toLowerCase()))
    if (toCreate.length === 0) continue

    await prisma.activityCategory.createMany({
      data: toCreate.map((name) => ({ workspaceId: workspace.id, name, isDefault: true })),
    })
    created += toCreate.length
    console.log(`  ${workspace.name}: ${toCreate.length} categories created.`)
  }

  console.log(`\nDone — ${created} categories created across ${workspaces.length} workspace(s).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
