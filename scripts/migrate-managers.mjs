#!/usr/bin/env node
/**
 * Manager Migration Script
 *
 * Updates existing portfolio records currently holding dummy manager values
 * ('Externe beheerder A', 'Externe beheerder B') to a randomly chosen manager
 * from the valid 59-manager list defined in lib/valid-managers.json.
 *
 * Idempotent — only touches portfolios whose manager is still a dummy value.
 * Safe to run repeatedly.
 *
 * Usage:
 *   DATABASE_URL=postgres://bcm:***@localhost:5432/bcm node scripts/migrate-managers.mjs
 *
 * Or via npm:
 *   npm run db:migrate:managers
 *
 * Or inside a Coolify container:
 *   docker exec <container> node scripts/migrate-managers.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────

const DUMMY_MANAGER_NAMES = ["Externe beheerder A", "Externe beheerder B"];

// ── Database connection ───────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required. Set it as an env var.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

// ── Helpers ────────────────────────────────────────────────────────────────

/** Pick a random element from an array. */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("[migrate-managers] Starting manager migration…");
  console.log("");

  // 1. Load valid managers list
  const validManagersPath = resolve(PROJECT_ROOT, "lib", "valid-managers.json");
  let validManagerNames;
  try {
    const raw = readFileSync(validManagersPath, "utf-8");
    const parsed = JSON.parse(raw);
    validManagerNames = parsed.map((m) => m.name.toUpperCase());
    console.log(`[migrate-managers] Loaded ${validManagerNames.length} valid manager names from ${validManagersPath}`);
  } catch (err) {
    console.error(`[migrate-managers] ERROR: Could not read valid-managers.json: ${err.message}`);
    await sql.end();
    process.exit(1);
  }

  // 2. Find dummy manager IDs in the database
  const dummyManagerNamesUpper = DUMMY_MANAGER_NAMES.map((n) => n.toUpperCase());
  const dummyManagers = await sql`
    SELECT id, name FROM managers
    WHERE UPPER(name) = ANY(${dummyManagerNamesUpper}::text[])
  `;

  if (dummyManagers.length === 0) {
    console.log("[migrate-managers] No dummy managers found in the database — nothing to migrate.");
    await sql.end();
    return;
  }

  console.log(`[migrate-managers] Found ${dummyManagers.length} dummy manager(s) in database:`);
  for (const m of dummyManagers) {
    console.log(`  - ${m.name} (${m.id})`);
  }
  console.log("");

  const dummyManagerIds = dummyManagers.map((m) => m.id);

  // 3. Get all valid manager IDs from the database (match by name against the valid list)
  const validDbManagers = await sql`
    SELECT id, name FROM managers
    WHERE UPPER(name) = ANY(${validManagerNames}::text[])
  `;

  if (validDbManagers.length === 0) {
    console.error("[migrate-managers] ERROR: No valid managers found in the database!");
    console.error("  The managers table must be seeded with valid managers before running this migration.");
    await sql.end();
    process.exit(1);
  }

  console.log(`[migrate-managers] Found ${validDbManagers.length} valid manager(s) in database.`);
  console.log("");

  const validManagerIds = validDbManagers.map((m) => m.id);

  // 4. Find all portfolios referencing dummy managers
  const affectedPortfolios = await sql`
    SELECT
      p.id AS portfolio_id,
      p.name AS portfolio_name,
      p.external_reference,
      c.name AS client_name,
      m.name AS current_manager_name,
      m.id AS current_manager_id
    FROM portfolios p
    JOIN clients c ON c.id = p.client_id
    JOIN managers m ON m.id = p.manager_id
    WHERE p.manager_id = ANY(${dummyManagerIds}::uuid[])
      AND p.active = true
    ORDER BY c.name, p.name
  `;

  if (affectedPortfolios.length === 0) {
    console.log("[migrate-managers] No portfolios reference dummy managers — nothing to migrate.");
    await sql.end();
    return;
  }

  console.log(`[migrate-managers] Found ${affectedPortfolios.length} portfolio(s) with dummy managers:`);
  for (const pf of affectedPortfolios) {
    console.log(`  ${pf.client_name} / ${pf.portfolio_name} (${pf.external_reference}) → ${pf.current_manager_name}`);
  }
  console.log("");

  // 5. Update each portfolio to a random valid manager
  let updatedCount = 0;
  let errorCount = 0;
  const changes = [];

  for (const pf of affectedPortfolios) {
    // Pick a random valid manager (different from the current one if possible)
    let newManagerId;
    const candidates = validManagerIds.filter((id) => id !== pf.current_manager_id);
    if (candidates.length > 0) {
      newManagerId = pickRandom(candidates);
    } else {
      // Only one valid manager? Use it anyway.
      newManagerId = pickRandom(validManagerIds);
    }

    // Find the new manager name for logging
    const newManager = validDbManagers.find((m) => m.id === newManagerId);
    const newManagerName = newManager ? newManager.name : "UNKNOWN";

    try {
      const result = await sql`
        UPDATE portfolios
        SET manager_id = ${newManagerId}::uuid
        WHERE id = ${pf.portfolio_id}::uuid
          AND manager_id = ${pf.current_manager_id}::uuid
      `;

      if (result.count > 0) {
        updatedCount++;
        changes.push({
          portfolioId: pf.portfolio_id,
          portfolioName: pf.portfolio_name,
          externalRef: pf.external_reference,
          clientName: pf.client_name,
          fromManager: pf.current_manager_name,
          fromManagerId: pf.current_manager_id,
          toManager: newManagerName,
          toManagerId: newManagerId,
        });
        console.log(
          `  ✓ ${pf.client_name} / ${pf.portfolio_name}: ${pf.current_manager_name} → ${newManagerName}`
        );
      } else {
        console.log(
          `  - ${pf.client_name} / ${pf.portfolio_name}: already updated (no rows affected)`
        );
      }
    } catch (err) {
      errorCount++;
      console.error(
        `  ✗ ${pf.client_name} / ${pf.portfolio_name}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // 6. Summary
  console.log("");
  console.log(`[migrate-managers] Migration complete.`);
  console.log(`  ✓ ${updatedCount} portfolio(s) updated`);
  if (errorCount > 0) {
    console.log(`  ✗ ${errorCount} error(s)`);
  }
  console.log("");

  // 7. Verification — check no portfolios still have dummy managers
  const remaining = await sql`
    SELECT COUNT(*) AS count
    FROM portfolios p
    JOIN managers m ON m.id = p.manager_id
    WHERE UPPER(m.name) = ANY(${dummyManagerNamesUpper}::text[])
      AND p.active = true
  `;

  const remainingCount = Number(remaining[0].count);
  if (remainingCount === 0) {
    console.log("[migrate-managers] VERIFICATION: No remaining portfolios with dummy managers. ✓");
  } else {
    console.log(`[migrate-managers] VERIFICATION: ${remainingCount} portfolio(s) still have dummy managers!`);
    console.log("  Re-run the migration to catch any that were skipped.");
  }

  await sql.end();
}

main().catch((err) => {
  console.error(`[migrate-managers] Fatal error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
