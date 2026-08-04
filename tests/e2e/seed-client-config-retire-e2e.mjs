#!/usr/bin/env node
/**
 * Seed test data for the client-config retire (Beëindigen) Playwright tests
 * (tests/e2e/client-config-retire.spec.ts, @db).
 *
 * Creates exactly one known ACTIVE portfolio_configuration row for the
 * retire tests to target, using the same stable-identity trick as
 * seed-client-config-edit-e2e.mjs. The row's primary_account_id is built
 * from the SECOND lookup pair/manager when available so it never collides
 * with the edit spec's row (which uses the first lookups) — both specs run
 * in parallel in the CI e2e-db-test job.
 *
 * Idempotent: deletes any previous change requests staged by this spec
 * (reference prefix RETIRE-E2E-) and any row carrying the E2E marker
 * long_name, then inserts a fresh active row. Prints the primary_account_id
 * on stdout so the spec can target the row by stable identity.
 *
 * Usage: DATABASE_URL=postgres://bcm@localhost:5432/bcm node tests/e2e/seed-client-config-retire-e2e.mjs
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}

const sql = (await import("postgres")).default(connectionString, { max: 1 });

const E2E_LONG_NAME = "E2E RETIRE FLOW TEST ROW";
// The spec stages change requests with this rationale prefix; cleanup keys on
// the free-text rationale because generated change-request references do not
// carry a stable E2E marker.
const E2E_RATIONALE_PREFIX = "Retire E2E acceptance";

try {
  // The change-process triggers (db/enforce_change_process.sql) are not
  // applied in CI, but allow the insert anyway if they ever are.
  await sql.unsafe("SET app.change_process_bypass = 'true'");

  // ── Pick real lookup values from the seeded reference data ──────────────
  // The edit-affordance spec uses the FIRST client/portfolio/pair/manager,
  // so this spec deliberately offsets by one (falling back to the first row
  // when only one exists) to keep the primary_account_ids disjoint.
  const [client] = await sql`
    SELECT client_code FROM client_config.client ORDER BY client_code LIMIT 1`;
  const portfolios = await sql`
    SELECT portfolio_code FROM client_config.portfolio ORDER BY portfolio_code`;
  const portfolio = portfolios[1] ?? portfolios[0];
  const pairs = await sql`
    SELECT ac.asset_class_code, sac.sub_asset_class_code
    FROM client_config.asset_class ac
    JOIN client_config.sub_asset_class sac ON sac.asset_class_id = ac.asset_class_id
    ORDER BY ac.asset_class_code, sac.sub_asset_class_code`;
  const pair = pairs[1] ?? pairs[0];
  const managers = await sql`
    SELECT manager_code FROM client_config.manager ORDER BY manager_code`;
  const manager = managers[1] ?? managers[0];
  const [benchmark] = await sql`
    SELECT benchmark_code FROM client_config.benchmark LIMIT 1`;
  const [npc] = await sql`
    SELECT npc_classification_id FROM client_config.npc_classification LIMIT 1`;

  if (!client || !portfolio || !pair || !manager || !benchmark || !npc) {
    console.error("ERROR: client_config lookup data missing — run db:seed first.");
    process.exit(1);
  }

  const primaryAccountId =
    `${client.client_code}*${pair.asset_class_code}${pair.sub_asset_class_code}*${manager.manager_code}`;

  // ── Clean up leftovers from a previous run (idempotent reseed) ─────────
  // Change requests first — their staged change_portfolio_configuration rows
  // cascade away, unblocking the row cleanup below.
  await sql`
    DELETE FROM change_requests WHERE rationale LIKE ${`${E2E_RATIONALE_PREFIX}%`}`;
  await sql`
    DELETE FROM client_config.portfolio_configuration
    WHERE primary_account_id = ${primaryAccountId} AND long_name = ${E2E_LONG_NAME}`;

  // ── Insert the fresh active test row ────────────────────────────────────
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
      ${E2E_LONG_NAME}, 'E2E-RETIRE', true, CURRENT_DATE
    )
    ON CONFLICT (primary_account_id) DO UPDATE SET
      long_name = EXCLUDED.long_name,
      short_name = EXCLUDED.short_name,
      active_ind = true,
      effective_from = CURRENT_DATE,
      effective_until = NULL`;

  console.log(primaryAccountId);
} catch (err) {
  console.error(`ERROR: seed failed: ${err.message}`);
  process.exit(1);
} finally {
  await sql.end();
}
