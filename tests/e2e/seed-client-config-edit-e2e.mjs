#!/usr/bin/env node
/**
 * Seed test data for the client-config edit-affordance Playwright tests
 * (tests/e2e/client-config-edit.spec.ts, @db).
 *
 * The CI e2e-db-test job seeds the client_config lookup tables but its
 * portfolio_configuration seed currently inserts 0 rows (the NPC name→id
 * mapping in seed-client-config.mjs does not match the generated ids), so
 * this script creates exactly one known portfolio_configuration row for the
 * edit tests to target.
 *
 * Idempotent: deletes any existing row carrying the E2E marker long_name
 * first, then inserts a fresh one. Prints the primary_account_id on stdout
 * so the spec can target the row by stable identity.
 *
 * Usage: DATABASE_URL=postgres://bcm@localhost:5432/bcm node tests/e2e/seed-client-config-edit-e2e.mjs
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}

const sql = (await import("postgres")).default(connectionString, { max: 1 });

const E2E_LONG_NAME = "E2E EDIT AFFORDANCE TEST ROW";

try {
  // The change-process triggers (db/enforce_change_process.sql) are not
  // applied in CI, but allow the insert anyway if they ever are.
  await sql.unsafe("SET app.change_process_bypass = 'true'");

  // ── Pick real lookup values from the seeded reference data ──────────────
  const [client] = await sql`
    SELECT client_code FROM client_config.client ORDER BY client_code LIMIT 1`;
  const [portfolio] = await sql`
    SELECT portfolio_code FROM client_config.portfolio LIMIT 1`;
  const [pair] = await sql`
    SELECT ac.asset_class_code, sac.sub_asset_class_code
    FROM client_config.asset_class ac
    JOIN client_config.sub_asset_class sac ON sac.asset_class_id = ac.asset_class_id
    LIMIT 1`;
  const [manager] = await sql`
    SELECT manager_code FROM client_config.manager LIMIT 1`;
  const [benchmark] = await sql`
    SELECT benchmark_code FROM client_config.benchmark LIMIT 1`;
  const [npc] = await sql`
    SELECT npc_classification_id FROM client_config.npc_classification LIMIT 1`;

  if (!client || !portfolio || !pair || !manager || !benchmark || !npc) {
    console.error("ERROR: client_config lookup data missing — run db:seed:client-config first.");
    process.exit(1);
  }

  const primaryAccountId =
    `${client.client_code}*${pair.asset_class_code}${pair.sub_asset_class_code}*${manager.manager_code}`;

  // ── Clean up any previous E2E row (idempotent reseed) ──────────────────
  await sql`
    DELETE FROM client_config.portfolio_configuration
    WHERE primary_account_id = ${primaryAccountId} AND long_name = ${E2E_LONG_NAME}`;

  // ── Insert the fresh test row ───────────────────────────────────────────
  await sql`
    INSERT INTO client_config.portfolio_configuration (
      primary_account_id, client_code, portfolio_code,
      asset_class_code, sub_asset_class_code,
      manager_code, benchmark_code, npc_classification_id,
      long_name, short_name, active_ind, effective_from
    ) VALUES (
      ${primaryAccountId}, ${client.client_code}, ${portfolio.portfolio_code},
      ${pair.asset_class_code}, ${pair.sub_asset_class_code},
      ${manager.manager_code}, ${benchmark.benchmark_code}, ${npc.npc_classification_id},
      ${E2E_LONG_NAME}, 'E2E-EDIT', true, CURRENT_DATE
    )
    ON CONFLICT (primary_account_id) DO UPDATE SET
      long_name = EXCLUDED.long_name,
      short_name = EXCLUDED.short_name,
      active_ind = true,
      effective_from = CURRENT_DATE`;

  console.log(primaryAccountId);
} catch (err) {
  console.error(`ERROR: seed failed: ${err.message}`);
  process.exit(1);
} finally {
  await sql.end();
}
