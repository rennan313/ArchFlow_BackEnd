/**
 * migrate-supabase-id.ts
 *
 * Adds the `supabaseId` field to the MongoDB `users` collection.
 *
 * What this does:
 *   1. Syncs Prisma schema → MongoDB (creates sparse unique index on supabaseId).
 *   2. Backfills all existing user documents with `supabaseId: null`.
 *   3. Verifies the index exists and documents are consistent.
 *
 * Usage:
 *   npx ts-node scripts/migrate-supabase-id.ts
 *
 * Safe to run multiple times (idempotent).
 */

import { execSync }  from "child_process";
import { MongoClient, type Db } from "mongodb";
import * as dotenv   from "dotenv";

dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string)    { console.log(`  ${msg}`); }
function ok(msg: string)     { console.log(`  ✅  ${msg}`); }
function warn(msg: string)   { console.log(`  ⚠️   ${msg}`); }
function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

// ── Step 1: prisma db push ────────────────────────────────────────────────────

async function syncPrismaSchema(): Promise<void> {
  section("STEP 1 — Sync Prisma schema → MongoDB");
  log("Running: prisma db push --accept-data-loss ...");
  try {
    execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
    ok("Prisma schema synced successfully.");
    ok("Sparse unique index on `supabaseId` created (if not present).");
  } catch (err) {
    console.error("❌  prisma db push failed:", err);
    process.exit(1);
  }
}

// ── Step 2: Backfill existing documents ──────────────────────────────────────

async function backfillSupabaseId(db: Db): Promise<void> {
  section("STEP 2 — Backfill existing users with supabaseId: null");

  const users = db.collection("users");

  const before = await users.countDocuments({ supabaseId: { $exists: false } });
  log(`Documents missing supabaseId: ${before}`);

  if (before === 0) {
    ok("All documents already have supabaseId field. Nothing to backfill.");
    return;
  }

  const result = await users.updateMany(
    { supabaseId: { $exists: false } },
    { $set: { supabaseId: null } },
  );

  ok(`Backfilled ${result.modifiedCount} documents with supabaseId: null.`);

  const after = await users.countDocuments({ supabaseId: { $exists: false } });
  if (after > 0) {
    warn(`${after} documents still missing supabaseId. Re-run to fix.`);
  }
}

// ── Step 3: Verify index ──────────────────────────────────────────────────────

async function verifyIndex(db: Db): Promise<void> {
  section("STEP 3 — Verify supabaseId index");

  const indexes = await db.collection("users").indexes();
  const idx = indexes.find(
    (i) => i.key && "supabaseId" in i.key,
  );

  if (!idx) {
    warn("Index on supabaseId NOT found. Prisma db push may not have run.");
    return;
  }

  ok(`Index found: ${JSON.stringify(idx.key)}`);
  log(`  unique: ${idx.unique ?? false}`);
  log(`  sparse: ${idx.sparse ?? false}`);

  if (!idx.unique) warn("Index is not unique! Check schema.prisma.");
  if (!idx.sparse)  warn("Index is not sparse! Multiple nulls may cause conflict.");
}

// ── Step 4: Summary ───────────────────────────────────────────────────────────

async function printSummary(db: Db): Promise<void> {
  section("STEP 4 — Migration summary");

  const users = db.collection("users");
  const total      = await users.countDocuments();
  const withId     = await users.countDocuments({ supabaseId: { $ne: null } });
  const withNull   = await users.countDocuments({ supabaseId: null });
  const missing    = await users.countDocuments({ supabaseId: { $exists: false } });

  log(`Total users:             ${total}`);
  log(`With supabaseId (linked): ${withId}`);
  log(`supabaseId = null:        ${withNull}`);
  log(`Missing field entirely:   ${missing}`);

  if (missing > 0) {
    warn("Some documents are still missing the field. Run migration again.");
  } else {
    ok("Migration complete. All documents have supabaseId field.");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🚀  ArchFlow — supabaseId migration\n");
  console.log(`    Environment: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`    Database:    ${DATABASE_URL!.replace(/\/\/.*@/, "//***@")}`);

  // Step 1 — sync schema (creates index via Prisma)
  await syncPrismaSchema();

  // Steps 2–4 — direct MongoDB operations
  const client = new MongoClient(DATABASE_URL!);
  try {
    await client.connect();
    const db = client.db();

    await backfillSupabaseId(db);
    await verifyIndex(db);
    await printSummary(db);
  } finally {
    await client.close();
  }

  console.log("\n✅  Migration finished successfully.\n");
}

main().catch((err) => {
  console.error("\n❌  Migration failed:", err);
  process.exit(1);
});
