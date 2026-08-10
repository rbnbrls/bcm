/**
 * Migration checks — plan 1.14 "migratiechecks" (issue #562).
 *
 * These checks validate that the BCM schema migrations:
 *
 *   1. apply cleanly and in order from a FRESH PostgreSQL database
 *      (an empty database must be fully bootstrapped by
 *      `scripts/migrate.mjs` alone — production startup runs only
 *      migrate.mjs, not db/init.sql),
 *   2. apply cleanly on top of the db/init.sql BASELINE
 *      (the CI path: `psql -f db/init.sql` → `npm run db:migrate`),
 *   3. are idempotent — a second `db:migrate` is a clean no-op that does
 *      not duplicate seeds or fail on existing objects,
 *   4. leave the database in the expected state: every table, migration
 *      column, named constraint, index and function of the schema
 *      manifest, plus the documented reference/seed data.
 *
 * Static drift checks (no database needed) additionally pin db/init.sql
 * and scripts/migrate.mjs to the same table contract, so a table added to
 * one entry point can never silently miss the other.
 *
 * The DB-backed suites follow the repo convention (see
 * tests/workflow-runtime-schema.test.ts): they only run when DATABASE_URL
 * is set — the CI `e2e-db-test` job or a local PostgreSQL 17 instance.
 * Run them individually, per repo convention:
 *
 *   DATABASE_URL=postgres://bcm:***@localhost:5432/bcm \
 *     npx vitest run tests/migration-checks.test.ts
 *
 * The fresh-database suite creates and drops its own scratch database
 * (`bcm_migration_check_*`), so the connected database is only read.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Sql = import("postgres").Sql;

const REPO_ROOT = path.resolve(__dirname, "..");
const INIT_SQL = path.join(REPO_ROOT, "db", "init.sql");
const MIGRATE_MJS = path.join(REPO_ROOT, "scripts", "migrate.mjs");

const HAS_DB = Boolean(process.env.DATABASE_URL);

// ─────────────────────────────────────────────────────────────────────────
// Migration contract manifest
// ─────────────────────────────────────────────────────────────────────────

/**
 * client_config staging tables that exist ONLY in scripts/migrate.mjs
 * (created during migration, not declared by db/init.sql). They are the
 * apply-target tables of the governed change-request pipeline. If this
 * list has to change, the migration contract changes with it — the static
 * drift test below enforces the exact difference.
 */
const STAGING_TABLES = [
  "client_config.npc_classification",
  "client_config.portfolio_configuration",
  "client_config.change_portfolio_configuration",
  "client_config.change_lookup_request",
  "client_config.client_onboarding_staging",
  "client_config.change_portfolio_metadata_request",
] as const;

/** Columns that migrate.mjs adds to pre-existing tables (ALTER TABLE ... ADD COLUMN). */
const MIGRATED_COLUMNS: Record<string, readonly string[]> = {
  change_requests: [
    "change_type_id",
    "fields",
    "stakeholders",
    "estimated_cost",
    "estimated_cost_currency",
    "estimated_lead_days",
  ],
  portfolios: ["wtp_classification_id", "asset_class_id", "sub_asset_class_id"],
  clients: ["regeling_type_id", "asset_class_id"],
  benchmark_catalog: ["asset_class_id"],
  new_benchmark_requests: ["asset_class_id"],
  "client_config.change_portfolio_configuration": ["apply_status", "apply_error"],
  "client_config.parent_account": ["active_ind"],
  "client_config.portfolio": ["active_ind"],
};

/** Named constraints that must exist after migration (public + client_config schema). */
const EXPECTED_CONSTRAINTS = [
  // core change-request model
  "chk_cr_status_values",
  // workflow definition layer
  "uq_workflow_definition_scope_slug",
  "chk_workflow_definition_slug",
  "chk_workflow_definition_status",
  "chk_workflow_version_publication",
  "chk_workflow_version_status",
  "uq_workflow_version_number",
  "uq_workflow_node_key",
  "uq_workflow_node_id_version",
  "fk_workflow_edge_source",
  "fk_workflow_edge_target",
  "uq_workflow_role_binding",
  // workflow runtime layer (idempotency + context integrity)
  "uq_workflow_instance_idempotency",
  "uq_workflow_node_idempotency",
  "uq_workflow_task_idempotency",
  "uq_workflow_snapshot_idempotency",
  "uq_workflow_intent_idempotency",
  "uq_workflow_event_idempotency",
  "uq_workflow_node_instance_context",
  "fk_workflow_task_instance",
  "fk_workflow_task_node_instance",
  "fk_workflow_snapshot_node",
  "fk_workflow_intent_node",
  "fk_workflow_intent_snapshot",
  "fk_workflow_event_node",
] as const;

/** Named indexes that must exist after migration. */
const EXPECTED_INDEXES = [
  "uq_workflow_version_single_draft",
  "idx_workflow_version_definition",
  "idx_workflow_node_version",
  "idx_workflow_edge_version",
  "idx_workflow_role_binding_version",
  "idx_workflow_definition_scope",
  "idx_pc_client_code",
  "idx_pc_portfolio_code",
  "idx_pc_benchmark_code",
  "idx_pc_active_ind",
  "idx_cpc_change_request_id",
  "idx_parent_account_active_ind",
  "idx_portfolio_active_ind",
  "idx_cpmp_change_request_id",
  "idx_admin_audit_log_dim_code",
  "idx_admin_audit_log_created",
] as const;

/** Functions defined by the schema (guards, triggers, sequence assigners). */
const EXPECTED_FUNCTIONS = [
  "update_sla_status_trigger",
  "workflow_assign_version_number",
  "workflow_assign_node_attempt",
  "workflow_assign_event_sequence",
  "workflow_guard_version_content",
  "workflow_guard_version_immutability",
  "workflow_require_published_version",
  "workflow_reject_mutation",
  "workflow_validate_task_role_binding",
  "client_config.validate_account_selection",
] as const;

/** Default change-type slugs that a fresh migration must seed. */
const EXPECTED_CHANGE_TYPE_SLUGS = ["benchmark_switch", "new_benchmark", "fee_change"] as const;

/**
 * Deterministic reference/seed counts after a fresh migration
 * (migrate.mjs seeds these when the tables are empty; every insert is
 * ON CONFLICT DO NOTHING). Business data (clients, portfolios, benchmark
 * catalog, portfolio_configuration) is asserted with lower bounds instead,
 * because the legacy-clients mirror may add rows depending on the
 * client_config seed.
 */
const EXACT_SEED_COUNTS: Record<string, number> = {
  // canonical change-type catalog seeded by migrate.mjs (14 slugs, incl.
  // benchmark_switch / new_benchmark / fee_change)
  change_type_config: 14,
  regeling_types: 4,
  stakeholders: 8,
  wtp_classifications: 6,
};

const MIN_SEED_COUNTS: Record<string, number> = {
  clients: 2,
  benchmark_catalog: 1,
  portfolios: 1,
  "client_config.portfolio_configuration": 1,
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Extract `CREATE TABLE IF NOT EXISTS <name>` declarations from a schema source. */
function extractTables(sqlText: string): Set<string> {
  const tables = new Set<string>();
  for (const rawLine of sqlText.split("\n")) {
    // migrate.mjs embeds DDL in template literals — strip the leading backtick
    const line = rawLine.trim().replace(/^`/, "").trim();
    if (!line.startsWith("CREATE TABLE")) continue;
    const match = line.match(/^CREATE TABLE IF NOT EXISTS\s+([a-z_.]+)/i);
    if (match) tables.add(match[1]);
  }
  return tables;
}

async function tableManifest(): Promise<{ init: string[]; migrate: string[] }> {
  const [initSql, migrateSql] = await Promise.all([
    fs.readFile(INIT_SQL, "utf8"),
    fs.readFile(MIGRATE_MJS, "utf8"),
  ]);
  const init = [...extractTables(initSql)].sort();
  const migrate = [
    ...extractTables(migrateSql.replaceAll("${CC_SCHEMA}", "client_config")),
  ].sort();
  return { init, migrate };
}

/**
 * Assert the full migration-state manifest against a live connection:
 * tables, migration columns, constraints, indexes, functions and seeds.
 *
 * `exactSeeds` pins the deterministic reference-data counts (used for the
 * fresh-database suite); otherwise lower bounds are used (a shared dev
 * database may legitimately contain more reference rows).
 */
async function assertMigrationState(sql: Sql, opts: { exactSeeds?: boolean } = {}) {
  const { init } = await tableManifest();

  // 1. Every base table (init.sql) and every staging table (migrate.mjs) exists.
  const tableRows = await sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema IN ('public', 'client_config')
  `;
  const actualTables = new Set(
    tableRows.map((r) => `${String(r.table_schema)}.${String(r.table_name)}`),
  );
  const qualify = (table: string) =>
    table.includes(".") ? table : `public.${table}`;
  for (const table of init) {
    expect(
      actualTables.has(qualify(table)),
      `missing table after migration: ${qualify(table)}`,
    ).toBe(true);
  }
  for (const table of STAGING_TABLES) {
    expect(actualTables.has(table), `missing staging table after migration: ${table}`).toBe(true);
  }

  // 2. Every migration-added column exists.
  const columnRows = await sql`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'client_config')
  `;
  const actualColumns = new Map<string, Set<string>>();
  for (const row of columnRows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!actualColumns.has(key)) actualColumns.set(key, new Set());
    actualColumns.get(key)!.add(String(row.column_name));
  }
  for (const [table, columns] of Object.entries(MIGRATED_COLUMNS)) {
    for (const column of columns) {
      expect(
        actualColumns.get(qualify(table))?.has(column),
        `missing migration column after migrate: ${table}.${column}`,
      ).toBe(true);
    }
  }

  // 3. Named constraints exist.
  const constraintRows = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE connamespace IN ('public'::regnamespace, 'client_config'::regnamespace)
  `;
  const actualConstraints = new Set(constraintRows.map((r) => String(r.conname)));
  for (const constraint of EXPECTED_CONSTRAINTS) {
    expect(
      actualConstraints.has(constraint),
      `missing constraint after migration: ${constraint}`,
    ).toBe(true);
  }

  // 4. Named indexes exist.
  const indexRows = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname IN ('public', 'client_config')
  `;
  const actualIndexes = new Set(indexRows.map((r) => String(r.indexname)));
  for (const index of EXPECTED_INDEXES) {
    expect(actualIndexes.has(index), `missing index after migration: ${index}`).toBe(true);
  }

  // 5. Schema functions exist.
  const functionRows = await sql`
    SELECT n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'client_config')
  `;
  const actualFunctions = new Set(
    functionRows.map((r) => `${r.nspname}.${r.proname}`),
  );
  for (const fn of EXPECTED_FUNCTIONS) {
    const qualified = fn.includes(".") ? fn : `public.${fn}`;
    expect(actualFunctions.has(qualified), `missing function after migration: ${fn}`).toBe(true);
  }

  // 6. Reference/seed data.
  const slugRows = await sql`SELECT slug FROM change_type_config`;
  const actualSlugs = new Set(slugRows.map((r) => String(r.slug)));
  for (const slug of EXPECTED_CHANGE_TYPE_SLUGS) {
    expect(actualSlugs.has(slug), `missing default change type seed: ${slug}`).toBe(true);
  }

  const exact = opts.exactSeeds ?? false;
  for (const [table, expected] of Object.entries(EXACT_SEED_COUNTS)) {
    const [row] = await sql.unsafe<{ c: number }[]>(
      `SELECT COUNT(*)::int AS c FROM ${table}`,
    );
    if (exact) {
      expect(row.c, `seed count for ${table} after fresh migrate`).toBe(expected);
    } else {
      expect(row.c, `seed count for ${table} after migrate`).toBeGreaterThanOrEqual(expected);
    }
  }
  for (const [table, minimum] of Object.entries(MIN_SEED_COUNTS)) {
    const [row] = await sql.unsafe<{ c: number }[]>(
      `SELECT COUNT(*)::int AS c FROM ${table}`,
    );
    expect(row.c, `seed count for ${table} after migrate`).toBeGreaterThanOrEqual(minimum);
  }
}

/** Run `node scripts/migrate.mjs` against the given DATABASE_URL and return its output. */
function runMigrate(databaseUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "node",
      ["scripts/migrate.mjs"],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const combined = `${stdout}\n${stderr}`;
          const wrapped = new Error(
            `db:migrate failed (${error.code ?? error.message})\n${combined.slice(-4000)}`,
          );
          (wrapped as Error & { output: string }).output = combined;
          reject(wrapped);
        } else {
          resolve(`${stdout}\n${stderr}`);
        }
      },
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("db:migrate timed out after 120s"));
    }, 120_000);
    child.on("close", () => clearTimeout(timer));
  });
}

/**
 * Assert a migrate run completed cleanly.
 *
 * The script's own retry design prints `[migrate] MISSING TABLES` and
 * `Failed to create table` even on a successful fresh bootstrap (pass 1
 * creates tables in dependency order and the retry pass fixes the rest),
 * so the reliable clean-run signals are: exit code 0 (no throw), the
 * completion marker, and absence of a fatal error / failed retry. The
 * resulting state is verified separately by assertMigrationState().
 */
function expectCleanMigrate(output: string) {
  expect(output).toContain("Database schema is ready.");
  expect(output).not.toContain("[migrate] Fatal error");
  expect(output).not.toContain("[migrate] Retry failed for");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Static drift contract — db/init.sql ↔ scripts/migrate.mjs (no DB)
// ─────────────────────────────────────────────────────────────────────────

describe("Migration contract: db/init.sql ↔ scripts/migrate.mjs drift", () => {
  let manifest: { init: string[]; migrate: string[] };

  beforeAll(async () => {
    manifest = await tableManifest();
  });

  it("declares every init.sql table in migrate.mjs (fresh deploys run only migrate.mjs)", () => {
    const migrate = new Set(manifest.migrate);
    const missing = manifest.init.filter((table) => !migrate.has(table));
    expect(missing, `tables in db/init.sql but not in scripts/migrate.mjs: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("lets migrate.mjs add exactly the documented client_config staging tables", () => {
    const init = new Set(manifest.init);
    const extras = manifest.migrate.filter((table) => !init.has(table)).sort();
    expect(extras, "migrate.mjs tables beyond init.sql must match the staging manifest")
      .toEqual([...STAGING_TABLES].sort());
  });

  it("declares at least the base tables of the runtime manifest in both entry points", () => {
    // Guard against the manifests diverging in the number of declared tables,
    // which would silently weaken the checks above.
    expect(manifest.init.length).toBeGreaterThanOrEqual(40);
    expect(manifest.migrate.length).toBe(manifest.init.length + STAGING_TABLES.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Baseline migration state — against an initialized database
//    (CI: db/init.sql → npm run db:migrate → this suite)
// ─────────────────────────────────────────────────────────────────────────

describe.runIf(HAS_DB)("Migration state against an initialized database (baseline)", () => {
  let sql: Sql;

  beforeAll(async () => {
    const { default: postgres } = await import("postgres");
    sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  it("matches the schema manifest after init.sql + db:migrate", async () => {
    await assertMigrationState(sql);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Fresh-database migration — empty DB → db:migrate → db:migrate again
//    (self-contained: creates and drops its own scratch database)
// ─────────────────────────────────────────────────────────────────────────

describe.runIf(HAS_DB)("Fresh-database migration (empty DB → db:migrate)", () => {
  let adminSql: Sql | null = null;
  let scratchName = "";
  let scratchUrl = "";

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/postgres"; // maintenance connection for CREATE/DROP DATABASE

    const { default: postgres } = await import("postgres");
    adminSql = postgres(url.toString(), { max: 1 });

    scratchName = `bcm_migration_check_${process.pid.toString(36)}_${randomUUID().slice(0, 8)}`;
    try {
      await adminSql.unsafe(`CREATE DATABASE ${scratchName}`);
    } catch (err) {
      throw new Error(
        `Could not create scratch database "${scratchName}" — the migration checks need a ` +
          `PostgreSQL role with CREATEDB (the CI service user and local "bcm" role both have it). ` +
          `Original error: ${err instanceof Error ? err.message : err}`,
      );
    }

    url.pathname = `/${scratchName}`;
    scratchUrl = url.toString();
  }, 60_000);

  afterAll(async () => {
    try {
      if (adminSql && scratchName) {
        await adminSql.unsafe(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
      }
    } catch (err) {
      // cleanup failure must not mask the test result
      console.warn(`[migration-checks] Could not drop scratch DB ${scratchName}: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await adminSql?.end();
    } catch {
      /* already closed */
    }
  });

  it("bootstraps the complete schema from an empty database", async () => {
    expect(scratchUrl).toBeTruthy();
    const output = await runMigrate(scratchUrl);
    expectCleanMigrate(output);

    const { default: postgres } = await import("postgres");
    const sql = postgres(scratchUrl, { max: 1 });
    try {
      await assertMigrationState(sql, { exactSeeds: true });
    } finally {
      await sql.end();
    }
  }, 180_000);

  it("re-applies cleanly and idempotently (second db:migrate is a no-op)", async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(scratchUrl, { max: 1 });

    const countsBefore = new Map<string, number>();
    try {
      for (const table of [
        ...Object.keys(EXACT_SEED_COUNTS),
        ...Object.keys(MIN_SEED_COUNTS),
      ]) {
        const [row] = await sql.unsafe<{ c: number }[]>(
          `SELECT COUNT(*)::int AS c FROM ${table}`,
        );
        countsBefore.set(table, row.c);
      }
    } finally {
      await sql.end();
    }

    const output = await runMigrate(scratchUrl);
    expectCleanMigrate(output);

    const sql2 = postgres(scratchUrl, { max: 1 });
    try {
      for (const [table, before] of countsBefore) {
        const [row] = await sql2.unsafe<{ c: number }[]>(
          `SELECT COUNT(*)::int AS c FROM ${table}`,
        );
        expect(row.c, `seed count for ${table} must not change on re-migrate`).toBe(before);
      }
    } finally {
      await sql2.end();
    }
  }, 180_000);
});
