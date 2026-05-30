/**
 * rollback-supabase-id.ts
 *
 * Rolls back the supabaseId migration.
 *
 * What this does:
 *   1. Drops the supabaseId index from MongoDB.
 *   2. Unsets the supabaseId field from ALL user documents.
 *   3. Confirms zero documents retain the field.
 *
 * ⚠️  WARNING: This will remove supabaseId from all users, breaking any
 *    Supabase Auth link. Only run in development or as a last resort.
 *
 * Usage:
 *   CONFIRM_ROLLBACK=yes npx ts-node scripts/rollback-supabase-id.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Prisma schema note:
 *   After rollback, manually remove the `supabaseId` field from schema.prisma
 *   and run `prisma db push` to clean up.
 */

import { MongoClient, type Db } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config();

// ── Safety gate ───────────────────────────────────────────────────────────────

if (process.env.CONFIRM_ROLLBACK !== "yes") {
  console.error(
    "\n❌  Safety gate: set CONFIRM_ROLLBACK=yes to run this script.\n" +
    "    Example: CONFIRM_ROLLBACK=yes npx ts-node scripts/rollback-supabase-id.ts\n",
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("\n❌  Rollback is blocked in production. Aborting.\n");
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

function section(title: string) {
  console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`);
}
function log(msg: string)  { console.log(`  ${msg}`); }
function ok(msg: string)   { console.log(`  ✅  ${msg}`); }
function warn(msg: string) { console.log(`  ⚠️   ${msg}`); }

// ── Step 1: Drop index ────────────────────────────────────────────────────────

async function dropIndex(db: Db): Promise<void> {
  section("STEP 1 — Drop supabaseId index");

  const users   = db.collection("users");
  const indexes = await users.indexes();
  const idx     = indexes.find((i) => i.key && "supabaseId" in i.key);

  if (!idx) {
    warn("Index on supabaseId not found — already removed or was never created.");
    return;
  }

  await users.dropIndex(idx.name as string);
  ok(`Dropped index: ${idx.name}`);
}

// ── Step 2: Unset field ───────────────────────────────────────────────────────

async function unsetSupabaseId(db: Db): Promise<void> {
  section("STEP 2 — Unset supabaseId from all users");

  const users = db.collection("users");

  // Save count before
  const linked = await users.countDocuments({ supabaseId: { $ne: null } });
  if (linked > 0) {
    warn(`${linked} users are currently linked to Supabase. Their links will be lost.`);
  }

  const result = await users.updateMany(
    { supabaseId: { $exists: true } },
    { $unset: { supabaseId: "" } },
  );

  ok(`Unset supabaseId from ${result.modifiedCount} documents.`);
}

// ── Step 3: Verify ────────────────────────────────────────────────────────────

async function verifyRollback(db: Db): Promise<void> {
  section("STEP 3 — Verify rollback");

  const remaining = await db
    .collection("users")
    .countDocuments({ supabaseId: { $exists: true } });

  if (remaining === 0) {
    ok("All supabaseId fields removed successfully.");
  } else {
    warn(`${remaining} documents still have supabaseId. Run rollback again.`);
  }

  // Check index is gone
  const indexes = await db.collection("users").indexes();
  const idx     = indexes.find((i) => i.key && "supabaseId" in i.key);
  if (idx) {
    warn("Index still exists after rollback attempt.");
  } else {
    ok("Index removed successfully.");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n⚠️   ArchFlow — supabaseId ROLLBACK\n");
  console.log(`    Environment: ${process.env.NODE_ENV ?? "development"}`);
  console.log("    This will remove supabaseId from all user documents.");

  const client = new MongoClient(DATABASE_URL!);
  try {
    await client.connect();
    const db = client.db();

    await dropIndex(db);
    await unsetSupabaseId(db);
    await verifyRollback(db);
  } finally {
    await client.close();
  }

  console.log(
    "\n⚠️   Rollback complete.\n" +
    "    Next: remove supabaseId from schema.prisma, then run prisma db push.\n",
  );
}

main().catch((err) => {
  console.error("\n❌  Rollback failed:", err);
  process.exit(1);
});
