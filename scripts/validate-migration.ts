/**
 * validate-migration.ts
 *
 * Runs a full health-check on the supabaseId migration.
 * Prints a detailed report and exits with code 1 if any check fails.
 *
 * Usage:
 *   npx ts-node scripts/validate-migration.ts
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { MongoClient, type Db } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

// ── Report helpers ────────────────────────────────────────────────────────────

interface CheckResult {
  name:    string;
  passed:  boolean;
  detail:  string;
}

const results: CheckResult[] = [];

function pass(name: string, detail: string) {
  results.push({ name, passed: true, detail });
}

function fail(name: string, detail: string) {
  results.push({ name, passed: false, detail });
}

// ── Checks ────────────────────────────────────────────────────────────────────

/**
 * CHK-01: Field backfill completeness
 * Every document in the `users` collection must have a `supabaseId` key
 * (value may be null or a UUID string — both are valid).
 */
async function checkFieldBackfill(db: Db) {
  const missing = await db
    .collection("users")
    .countDocuments({ supabaseId: { $exists: false } });

  if (missing === 0) {
    pass("CHK-01 Field backfill", "All users have supabaseId field.");
  } else {
    fail("CHK-01 Field backfill", `${missing} user(s) are still missing supabaseId.`);
  }
}

/**
 * CHK-02: Sparse unique index exists
 * Prisma creates a sparse+unique index for `String? @unique`.
 * Sparse = only index documents where the field is not null, so multiple
 * null values are allowed.
 */
async function checkIndex(db: Db) {
  const indexes = await db.collection("users").indexes();
  const idx     = indexes.find((i) => i.key && "supabaseId" in i.key);

  if (!idx) {
    fail("CHK-02 Index exists",  "No index found on supabaseId.");
    return;
  }

  pass("CHK-02 Index exists", `Index name: ${idx.name}`);

  if (idx.unique) {
    pass("CHK-03 Index unique",  "unique: true");
  } else {
    fail("CHK-03 Index unique",  "Index is NOT unique — duplicate supabaseIds possible.");
  }

  if (idx.sparse) {
    pass("CHK-04 Index sparse",  "sparse: true — multiple nulls allowed.");
  } else {
    fail("CHK-04 Index sparse",  "Index is NOT sparse — multiple null supabaseIds will conflict.");
  }
}

/**
 * CHK-05: Duplicate supabaseId values
 * No two users should share the same non-null supabaseId.
 */
async function checkNoDuplicates(db: Db) {
  const pipeline = [
    { $match:  { supabaseId: { $ne: null } } },
    { $group:  { _id: "$supabaseId", count: { $sum: 1 } } },
    { $match:  { count: { $gt: 1 } } },
    { $count:  "duplicates" },
  ];

  const result = await db.collection("users").aggregate(pipeline).toArray();
  const dups   = result[0]?.duplicates ?? 0;

  if (dups === 0) {
    pass("CHK-05 No duplicates", "No duplicate supabaseId values found.");
  } else {
    fail("CHK-05 No duplicates", `${dups} duplicate supabaseId value(s) detected!`);
  }
}

/**
 * CHK-06: UUID format for non-null values
 * Supabase user IDs are UUIDs. Every non-null supabaseId must match the
 * standard UUID v4 pattern.
 */
async function checkUuidFormat(db: Db) {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const withId = await db
    .collection("users")
    .find({ supabaseId: { $ne: null } })
    .project({ supabaseId: 1, email: 1 })
    .toArray();

  const invalid = withId.filter((u) => !UUID_REGEX.test(u.supabaseId));

  if (invalid.length === 0) {
    pass("CHK-06 UUID format", `${withId.length} linked user(s) — all valid UUIDs.`);
  } else {
    fail(
      "CHK-06 UUID format",
      `${invalid.length} user(s) have malformed supabaseId: ` +
      invalid.map((u) => u.email).join(", "),
    );
  }
}

/**
 * CHK-07: Provision endpoint reachable (optional — only if API_URL is set)
 */
async function checkProvisionEndpoint() {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    results.push({
      name:   "CHK-07 Provision endpoint",
      passed: true,
      detail: "Skipped — API_URL not set.",
    });
    return;
  }

  try {
    const res = await fetch(`${apiUrl}/api/auth/provision`, {
      method:  "OPTIONS",
      signal:  AbortSignal.timeout(3000),
    });
    if (res.status < 500) {
      pass("CHK-07 Provision endpoint", `OPTIONS ${apiUrl}/api/auth/provision → ${res.status}`);
    } else {
      fail("CHK-07 Provision endpoint", `Server error: ${res.status}`);
    }
  } catch (err) {
    fail("CHK-07 Provision endpoint", `Unreachable: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * CHK-08: Stats summary (informational, always passes)
 */
async function checkStats(db: Db) {
  const total    = await db.collection("users").countDocuments();
  const linked   = await db.collection("users").countDocuments({ supabaseId: { $ne: null } });
  const unlinked = total - linked;
  const pct      = total > 0 ? ((linked / total) * 100).toFixed(1) : "0.0";

  pass(
    "CHK-08 Coverage stats",
    `${linked}/${total} users linked (${pct}%) — ${unlinked} pre-Supabase users.`,
  );
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport(): boolean {
  console.log("\n" + "═".repeat(62));
  console.log("  Vincel Studio — supabaseId migration validation report");
  console.log("═".repeat(62));

  for (const r of results) {
    const icon   = r.passed ? "✅" : "❌";
    const status = r.passed ? "PASS" : "FAIL";
    console.log(`\n  ${icon}  [${status}]  ${r.name}`);
    console.log(`        ${r.detail}`);
  }

  const failed = results.filter((r) => !r.passed).length;
  const passed = results.filter((r) =>  r.passed).length;

  console.log("\n" + "─".repeat(62));
  console.log(`  Results: ${passed} passed / ${failed} failed`);
  console.log("─".repeat(62) + "\n");

  return failed === 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🔍  Running supabaseId migration validation...");

  const client = new MongoClient(DATABASE_URL!);
  try {
    await client.connect();
    const db = client.db();

    await checkFieldBackfill(db);
    await checkIndex(db);
    await checkNoDuplicates(db);
    await checkUuidFormat(db);
    await checkStats(db);
  } finally {
    await client.close();
  }

  await checkProvisionEndpoint();

  const allPassed = printReport();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("❌  Validation script failed:", err);
  process.exit(1);
});
