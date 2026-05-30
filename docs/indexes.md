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
```
