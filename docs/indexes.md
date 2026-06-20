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
```
