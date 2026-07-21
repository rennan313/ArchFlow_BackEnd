# ArchFlow — MongoDB Manual Indexes

## supabaseId Sparse Unique Index

### Why

Prisma's `@unique` on a nullable field creates a standard unique index.
MongoDB treats `null` as a distinct value — so two documents with `supabaseId: null`
violate the unique constraint.

The correct index for "unique when not null" is a **sparse unique index**, which
MongoDB supports natively but Prisma (on MongoDB) does not expose.

### How to create it

Run this command once per environment (local, staging, production).
The index is idempotent — running it multiple times is safe.

**Via MongoDB Shell (`mongosh`):**
```js
use ArchFlowDb

db.users.createIndex(
  { supabaseId: 1 },
  {
    unique:  true,
    sparse:  true,       // skips documents where supabaseId is null/missing
    name:    "users_supabaseId_sparse_unique",
  }
)
```

**Via MongoDB Compass:**
1. Open the `users` collection
2. Indexes tab → Create Index
3. Field: `supabaseId`, Order: `1 (asc)`
4. Options: ✅ Unique, ✅ Sparse
5. Name: `users_supabaseId_sparse_unique`

### Verification

```js
db.users.getIndexes()
// Should include: { key: { supabaseId: 1 }, unique: true, sparse: true }
```

### When to run

- Local development: once, after `prisma db push`
- Staging/Production: as part of the deployment runbook for Phase 1

## Billing — Sparse Unique Indexes

### Why

Same root cause as `supabaseId` above. Two fields introduced by the billing
foundation (Phase 1) are optional today and will only be populated once the
Mercado Pago integration (Phase 2) actually writes to them — until then, every
row has them as `null`, and a second row would violate a plain `@unique` index.

- `subscriptions.mpSubscriptionId` — null for every Subscription until a
  workspace actually checks out through Mercado Pago.
- `billing_history.mpPaymentId` — null for any manually-recorded entry (there
  are none yet in Phase 1, but the column exists from day one).

### How to create them

```js
use ArchFlowDb

db.subscriptions.createIndex(
  { mpSubscriptionId: 1 },
  { unique: true, sparse: true, name: "subscriptions_mpSubscriptionId_sparse_unique" }
)

db.billing_history.createIndex(
  { mpPaymentId: 1 },
  { unique: true, sparse: true, name: "billing_history_mpPaymentId_sparse_unique" }
)
```

### Verification

```js
db.subscriptions.getIndexes()
db.billing_history.getIndexes()
// Both should show { unique: true, sparse: true } on the respective field
```

### When to run

- Local development: once, right after running the Phase 1 backfill script
  (`scripts/backfill-subscriptions.ts`)
- Staging/Production: as part of the Phase 2 (Mercado Pago) deployment runbook
  — must exist **before** the first real checkout, not after

## Compras — purchase_orders.financialDocumentId Sparse Unique Index

### Why

Same root cause as `supabaseId` above — `financialDocumentId` is null for
every `DRAFT`/`CANCELLED` `PurchaseOrder` and only gets set once, on
`approve()`. Caught for real (not by a mocked test) by
`scripts/rc-compras-approve-check.ts`'s second scenario, which failed with
`Unique constraint failed on the constraint: purchase_orders_financialDocumentId_key`
the moment a second DRAFT order existed in the same workspace — this was the
reason `financialDocumentId` was demoted from `@unique` in the Prisma schema
to a manually-created sparse index instead.

### How to create it

```js
use ArchFlowDb

db.purchase_orders.createIndex(
  { financialDocumentId: 1 },
  { unique: true, sparse: true, name: "purchase_orders_financialDocumentId_sparse_unique" }
)
```

### Verification

```js
db.purchase_orders.getIndexes()
// Should show { unique: true, sparse: true } on financialDocumentId
```

### When to run

- Local development: once, after `prisma db push` for the Compras Fase 1 schema
- Staging/Production: as part of the Compras Fase 1 deployment runbook —
  must exist before the first real `approve()` in that environment

## Worklog — time_entries.activeOwnerId Sparse Unique Index

**Superseded by Worklog V3 (ADR-024)**: `TimeEntry.activeOwnerId` no longer
exists in `schema.prisma` — the one-active-per-user invariant moved to the
new `WorkSession` entity. See "Worklog V3 — work_sessions.activeOwnerId
Sparse Unique Index" below for the current index. This section is kept for
history; `scripts/create-worklog-indexes.ts` now also drops this index if
still present in an environment that hasn't been migrated yet.

### Why

Same root cause as `supabaseId`/`financialDocumentId` above — `activeOwnerId`
is null for every `COMPLETED`/archived `TimeEntry` and is only set to the
owning `userId` while the timer is `RUNNING`/`PAUSED` (`WORKLOG_ARCHITECTURE_
DECISIONS.md` ADR-021). It is declared as a plain nullable field in
`schema.prisma` (no `@unique`) precisely because Prisma's `@unique` on Mongo
would collide every pair of completed entries on their shared `null` — the
same bug that demoted `financialDocumentId` above, applied here from the
start instead of discovered later by a concurrency script.

### How to create it

```js
use ArchFlowDb

db.time_entries.createIndex(
  { activeOwnerId: 1 },
  { unique: true, sparse: true, name: "time_entries_activeOwnerId_sparse_unique" }
)
```

### Verification

```js
db.time_entries.getIndexes()
// Should show { unique: true, sparse: true } on activeOwnerId
```

### When to run

- Local development: once, after `prisma db push` for the Worklog Fase 1
  schema — **before** running the `start()` concurrency script (checklist
  item 12), otherwise the script validates nothing but query-level timing
- Staging/Production: as part of the Worklog Fase 1 deployment runbook —
  must exist before the first real `start()` in that environment

### Automated verification (MEL-02, Worklog Sprint V2)

`scripts/check-worklog-indexes.ts` (`npm run check:worklog-indexes`) is a
**read-only** check against whatever database `DATABASE_URL` points to — it
lists the indexes on `time_entries` and reports whether one exists on
`activeOwnerId` with `{ unique: true, sparse: true }`. It never creates or
alters anything (`schema.prisma` intentionally has no `@unique` here — see
above — and this script must not change that). Exit code is `0` when the
index is present and correctly shaped, `1` otherwise, so it can be wired into
a deploy-time gate later without extra parsing.

**Result as of 2026-07-20, `arch-flow-dev`**: was **MISSING** when first
checked (`time_entries` had only `_id_`,
`time_entries_workspaceId_userId_archived_idx`, and
`time_entries_workspaceId_projectId_idx`). Created the same day via
`scripts/create-worklog-indexes.ts` (`npm run create:worklog-indexes`) —
same idempotent pattern as `create-billing-indexes.ts` — and re-verified
with `check:worklog-indexes`: **now present** with
`{ unique: true, sparse: true }`. The one-active-timer-per-user invariant
(ADR-021) is protected by the database in `arch-flow-dev` as of this sprint.

**Still required**: run `npm run create:worklog-indexes` (or the manual
`createIndex` command above) against every other environment — staging and
production — before Worklog carries any real concurrent load there. This
check/creation pair was only run against the local dev database as part of
Worklog Sprint V2, Fase 1 (MEL-02); it has not been run anywhere else yet.

## Worklog V3 — work_sessions.activeOwnerId Sparse Unique Index

### Why

Same pattern as the superseded `time_entries.activeOwnerId` index above,
moved one level up — `WorkSession.activeOwnerId` is null for every
`COMPLETED` session and only set to the owning `userId` while the session is
`RUNNING`/`PAUSED` (`WORKLOG_ARCHITECTURE_DECISIONS.md` ADR-024). Declared as
a plain nullable field in `schema.prisma` (no `@unique`) for the same reason
as before: Prisma's `@unique` on Mongo is not sparse.

### How to create it

```js
use ArchFlowDb

db.work_sessions.createIndex(
  { activeOwnerId: 1 },
  { unique: true, sparse: true, name: "work_sessions_activeOwnerId_sparse_unique" }
)
```

Or `npm run create:worklog-indexes` — idempotent, also drops the superseded
`time_entries.activeOwnerId` index if still present in that environment.

### Verification

```js
db.work_sessions.getIndexes()
// Should show { unique: true, sparse: true } on activeOwnerId
```

Or `npm run check:worklog-indexes` (`scripts/check-worklog-indexes.ts`) —
read-only, reports pass/fail without altering anything.

### When to run

- Local development: once, after `prisma db push` for the Worklog V3 schema
  — **before** exercising `workSessionRepository.start()` concurrently
  (checklist item 12 equivalent), otherwise a concurrency check validates
  only query-level timing, not the database constraint.
- Staging/Production: as part of the Worklog V3 deployment runbook — must
  exist before the first real `start()` in that environment.

**⚠ Before running against any environment**: confirm `DATABASE_URL` actually
points at that environment's database, not production — this repo has had a
duplicate `DATABASE_URL` entry silently point local dev at production Mongo
before. `create-worklog-indexes.ts` only touches index metadata (never
document data), but verify the target first regardless.

**Not yet run in any environment** — this section documents the target
shape for the Worklog V3 Fase 1 rollout; execution against `arch-flow-dev`
and any other environment is a deployment step, not something done as part
of writing this schema/code.
