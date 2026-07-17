import { PrismaClient } from "@prisma/client"
import { env } from "@/lib/env"
// Registers BigInt.prototype.toJSON as a side effect (see money.ts) —
// imported here, the earliest point any BigInt-typed query result can
// exist, so it's always active before a route ever tries to JSON-serialize
// one. Every route already goes through this module transitively.
import "@/lib/money/money"

// ADR-020 — Entity Lifecycle. Every model that participates in the
// archive/restore lifecycle (see entityLifecycle.service.ts) — kept as an
// explicit allow-list rather than introspected from the schema at runtime,
// so a model never starts being silently filtered just because someone adds
// a field named `archived` for an unrelated reason.
const ARCHIVABLE_MODELS = new Set([
  "Client", "Opportunity", "Proposal", "Project", "Meeting", "Document",
  "Supplier", "SupplierCategory", "CostCenter", "BankAccount", "FinancialCategory",
  "ProposalTemplate", "ProposalSection", "ProposalBlock", "ProposalNarrative",
])

// Injects `archived: false` into a listing query's `where` — but only when
// the caller hasn't already specified `archived` itself. This is what lets
// every "normal" screen ignore archived records with zero code (no
// repository has to remember `archived: false` on its own anymore) while
// still letting the Archived Items screen ask for `archived: true`
// explicitly and get exactly that, unfiltered by this extension.
function withArchivedDefault(model: string, args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!ARCHIVABLE_MODELS.has(model)) return args ?? {}
  const where = (args?.where as Record<string, unknown> | undefined) ?? {}
  if ("archived" in where) return args ?? {}
  return { ...(args ?? {}), where: { ...where, archived: false } }
}

function createClient() {
  return new PrismaClient({
    log: env.isDev ? ["query", "error", "warn"] : ["error"],
  }).$extends({
    name: "entity-lifecycle-archived-filter",
    query: {
      $allModels: {
        findMany({ model, args, query }) {
          return query(withArchivedDefault(model, args as Record<string, unknown>))
        },
        count({ model, args, query }) {
          return query(withArchivedDefault(model, args as Record<string, unknown>))
        },
        aggregate({ model, args, query }) {
          return query(withArchivedDefault(model, args as Record<string, unknown>))
        },
        groupBy({ model, args, query }) {
          // withArchivedDefault only ever adds/merges `where.archived` — `by`
          // (required on groupBy args) always survives untouched, so this
          // cast back to the original shape is safe.
          return query(withArchivedDefault(model, args as Record<string, unknown>) as typeof args)
        },
      },
    },
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (env.isDev) {
  globalForPrisma.prisma = prisma
}

// The `entity-lifecycle-archived-filter` extension above changes the shape of
// prisma.$transaction()'s interactive callback: it's no longer the vanilla
// `Prisma.TransactionClient` the generated client exports, but a client
// carrying the same extension. Every repository that accepts "either the
// global prisma or a transaction client" (the find-or-create/compose pattern
// used by ADR-017) must type that parameter against THIS derived type, not
// `Prisma.TransactionClient` — otherwise a real `tx` from `prisma.$transaction`
// fails to structurally match the plain (un-extended) transaction type.
export type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
