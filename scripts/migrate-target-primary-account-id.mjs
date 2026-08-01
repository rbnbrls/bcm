/**
 * Reversible migration: add `target_primary_account_id` to
 * client_config.change_portfolio_configuration.
 *
 * The column stores the original primary_account_id of the live row an
 * UPDATE/DELETE change targets, so the apply step (applyChangePortfolioConfigurations)
 * can find the correct row even when the change modifies fields that derive
 * primary_account_id (asset_class_code, sub_asset_class_code, manager_code).
 * NULL for CREATE rows, which have no target row.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate-target-primary-account-id.mjs up
 *   DATABASE_URL=postgres://... node scripts/migrate-target-primary-account-id.mjs down
 *
 * The default (no argument) is `up`. The migration is idempotent; `down`
 * drops the column, its check constraint and its index.
 *
 * Note: scripts/migrate.mjs also contains this column in the idempotent
 * startup schema migration (section 7f.3). This script exists for operators
 * who need an explicit, reversible migration step on already-running
 * deployments.
 */
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run this migration.");
}

const CC_SCHEMA = "client_config";
const TABLE = `${CC_SCHEMA}.change_portfolio_configuration`;
const CONSTRAINT = "change_portfolio_configuration_target_primary_account_id_check";
const INDEX = "idx_cpc_target_primary_account_id";
const PATTERN = "'^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$'";

async function up(sql) {
  // 1. Add the column (idempotent).
  await sql.unsafe(`
    ALTER TABLE ${TABLE}
    ADD COLUMN IF NOT EXISTS target_primary_account_id varchar(13)
  `);
  // 2. Backfill existing staged UPDATE/DELETE rows from their staged
  //    dimension values — the best available target for rows staged before
  //    this column existed (preserves the previous derive-from-staged
  //    behaviour of the apply step).
  await sql.unsafe(`
    UPDATE ${TABLE}
    SET target_primary_account_id =
        client_code || '*' || asset_class_code || sub_asset_class_code || '*' || manager_code
    WHERE target_primary_account_id IS NULL
      AND action_type IN ('UPDATE','DELETE')
  `);
  // 3. Check constraint (drop/re-add for idempotency + re-run safety).
  await sql.unsafe(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CONSTRAINT}`);
  await sql.unsafe(`
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT ${CONSTRAINT}
    CHECK (target_primary_account_id IS NULL OR target_primary_account_id ~ ${PATTERN})
  `);
  // 4. Index for UPDATE/DELETE target lookups.
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS ${INDEX} ON ${TABLE}(target_primary_account_id)`);
}

async function down(sql) {
  await sql.unsafe(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CONSTRAINT}`);
  await sql.unsafe(`DROP INDEX IF EXISTS ${INDEX}`);
  await sql.unsafe(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS target_primary_account_id`);
}

const direction = (process.argv[2] ?? "up").toLowerCase();
const sql = postgres(connectionString, { max: 1 });

try {
  if (direction === "up") {
    await up(sql);
    console.log(`[migrate:target-primary-account-id] Applied (up): ${TABLE}.target_primary_account_id added.`);
  } else if (direction === "down") {
    await down(sql);
    console.log(`[migrate:target-primary-account-id] Applied (down): ${TABLE}.target_primary_account_id removed.`);
  } else {
    throw new Error(`Unknown direction "${direction}" — use "up" or "down".`);
  }
} catch (err) {
  console.error(
    `[migrate:target-primary-account-id] Failed (${direction}):`,
    err instanceof Error ? err.message : err
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
