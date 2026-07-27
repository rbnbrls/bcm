/**
 * Schema Optimization Migration
 *
 * Applies performance and structural improvements to the database schema:
 *   1. Missing indexes on foreign key columns (Postgres does NOT auto-index FKs)
 *   2. Missing indexes on frequently filtered / sorted columns
 *   3. Composite indexes for common query patterns
 *   4. Missing CHECK constraints for status/type columns
 *   5. Missing ON DELETE CASCADE actions on foreign keys
 *   6. Tables that existed only in code, never in init.sql
 *   7. Schema evolution for columns added after initial deployment
 *
 * Safe to re-run — every DDL uses IF NOT EXISTS / IF EXISTS guards.
 * Run via: node scripts/optimize-schema.mjs
 * Requires DATABASE_URL env var.
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[optimize-schema] DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

// ── Helpers ──────────────────────────────────────────────────────────────

const migrated = [];
const skipped = [];
const failed = [];

function ok(label) {
  migrated.push(label);
  console.log(`  ✓ ${label}`);
}

function skp(label, reason) {
  skipped.push({ label, reason });
  console.log(`  - ${label} (${reason})`);
}

function fail(label, err) {
  failed.push({ label, error: err instanceof Error ? err.message : String(err) });
  console.error(`  ✗ ${label}: ${err instanceof Error ? err.message : err}`);
}

async function tryRun(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (err) {
    if (String(err).includes("already exists") || String(err).includes("duplicate")) {
      skp(label, String(err));
    } else {
      fail(label, err);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n[1/7] Indexes on foreign keys (performance — most critical)");
  console.log("     Postgres does NOT auto-index FK columns, so every");
  console.log("     JOIN on these columns causes sequential scans.\n");

  const fkIndexes = [
    // change_requests FK columns
    ["idx_cr_client_id", "CREATE INDEX IF NOT EXISTS idx_cr_client_id ON change_requests (client_id)"],
    ["idx_cr_change_type_id", "CREATE INDEX IF NOT EXISTS idx_cr_change_type_id ON change_requests (change_type_id)"],

    // change_request_items FK columns
    ["idx_cri_change_request_id", "CREATE INDEX IF NOT EXISTS idx_cri_change_request_id ON change_request_items (change_request_id)"],
    ["idx_cri_portfolio_id", "CREATE INDEX IF NOT EXISTS idx_cri_portfolio_id ON change_request_items (portfolio_id)"],
    ["idx_cri_previous_benchmark_id", "CREATE INDEX IF NOT EXISTS idx_cri_previous_benchmark_id ON change_request_items (previous_benchmark_id)"],
    ["idx_cri_requested_benchmark_id", "CREATE INDEX IF NOT EXISTS idx_cri_requested_benchmark_id ON change_request_items (requested_benchmark_id)"],

    // new_benchmark_requests FK
    ["idx_nbr_change_request_id", "CREATE INDEX IF NOT EXISTS idx_nbr_change_request_id ON new_benchmark_requests (change_request_id)"],

    // audit_log FK
    ["idx_al_change_request_id", "CREATE INDEX IF NOT EXISTS idx_al_change_request_id ON audit_log (change_request_id)"],

    // approvals FK
    ["idx_app_change_request_id", "CREATE INDEX IF NOT EXISTS idx_app_change_request_id ON approvals (change_request_id)"],

    // notification_config FK
    ["idx_nc_change_request_id", "CREATE INDEX IF NOT EXISTS idx_nc_change_request_id ON notification_config (change_request_id)"],

    // notification_log FK
    ["idx_nl_change_request_id", "CREATE INDEX IF NOT EXISTS idx_nl_change_request_id ON notification_log (change_request_id)"],

    // status_history FK
    ["idx_sh_change_request_id", "CREATE INDEX IF NOT EXISTS idx_sh_change_request_id ON status_history (change_request_id)"],

    // portfolios FK
    ["idx_p_client_id", "CREATE INDEX IF NOT EXISTS idx_p_client_id ON portfolios (client_id)"],
  ];

  for (const [label, ddl] of fkIndexes) {
    await tryRun(label, () => sql.unsafe(ddl));
  }

  console.log("\n[2/7] Indexes on frequently filtered / sorted columns\n");

  const filterIndexes = [
    ["idx_cr_status", "CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests (status)"],
    ["idx_cr_created_at", "CREATE INDEX IF NOT EXISTS idx_cr_created_at ON change_requests (created_at DESC)"],
    ["idx_cr_change_type", "CREATE INDEX IF NOT EXISTS idx_cr_change_type ON change_requests (change_type)"],
    ["idx_clients_status", "CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status)"],
    ["idx_bc_active", "CREATE INDEX IF NOT EXISTS idx_bc_active ON benchmark_catalog (active)"],
    ["idx_bc_asset_class", "CREATE INDEX IF NOT EXISTS idx_bc_asset_class ON benchmark_catalog (asset_class)"],
    ["idx_p_active", "CREATE INDEX IF NOT EXISTS idx_p_active ON portfolios (active)"],
    ["idx_nl_status", "CREATE INDEX IF NOT EXISTS idx_nl_status ON notification_log (status)"],
    ["idx_nc_is_active", "CREATE INDEX IF NOT EXISTS idx_nc_is_active ON notification_config (is_active)"],
    ["idx_ctc_active", "CREATE INDEX IF NOT EXISTS idx_ctc_active ON change_type_config (active)"],
    ["idx_ctc_slug", "CREATE INDEX IF NOT EXISTS idx_ctc_slug ON change_type_config (slug)"],
  ];

  for (const [label, ddl] of filterIndexes) {
    await tryRun(label, () => sql.unsafe(ddl));
  }

  console.log("\n[3/7] Composite indexes for common query patterns\n");

  const compositeIndexes = [
    // Client history page: all change requests for a client, newest first
    ["idx_cr_client_created", "CREATE INDEX IF NOT EXISTS idx_cr_client_created ON change_requests (client_id, created_at DESC)"],

    // Dashboard filtered by status: status + recency
    ["idx_cr_status_created", "CREATE INDEX IF NOT EXISTS idx_cr_status_created ON change_requests (status, created_at DESC)"],

    // Client history filtered by status
    ["idx_cr_client_status_created",
      "CREATE INDEX IF NOT EXISTS idx_cr_client_status_created ON change_requests (client_id, status, created_at DESC)"],

    // Active portfolios for a client (getClientConfigs)
    ["idx_p_client_active_name",
      "CREATE INDEX IF NOT EXISTS idx_p_client_active_name ON portfolios (client_id, active, name)"],

    // Change request items need fast lookup by CR + join to portfolios
    // (UNIQUE(change_request_id, portfolio_id) already creates an index)
  ];

  for (const [label, ddl] of compositeIndexes) {
    await tryRun(label, () => sql.unsafe(ddl));
  }

  console.log("\n[4/7] Missing CHECK constraints for data integrity\n");

  const constraints = [
    // constrain status values to known values
    [
      "chk_cr_status_values",
      `ALTER TABLE change_requests ADD CONSTRAINT chk_cr_status_values
       CHECK (status IN ('draft','submitted','pending_approval','accepted','approved','rejected','in_progress','processed','validated','failed'))`,
    ],
    // notification_log status values
    [
      "chk_nl_status_values",
      `ALTER TABLE notification_log ADD CONSTRAINT chk_nl_status_values
       CHECK (status IN ('pending','sent','failed','cancelled'))`,
    ],
  ];

  for (const [label, ddl] of constraints) {
    await tryRun(label, () => sql.unsafe(ddl));
  }

  console.log("\n[5/7] Tables only defined in code — adding to init schema\n");

  const missingTables = [
    // status_history — created in schemaMigrations but not in init.sql
    [
      "status_history",
      `CREATE TABLE IF NOT EXISTS status_history (
        id uuid PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        from_status text,
        to_status text NOT NULL,
        changed_by text,
        changed_at timestamptz NOT NULL DEFAULT now()
      )`,
    ],
    // webhook_configs — created in ensureWebhookConfigTable but not in init.sql
    [
      "webhook_configs",
      `CREATE TABLE IF NOT EXISTS webhook_configs (
        id text PRIMARY KEY,
        name text NOT NULL,
        url text NOT NULL,
        secret text,
        events jsonb NOT NULL DEFAULT '[]'::jsonb,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    ],
  ];

  for (const [label, ddl] of missingTables) {
    await tryRun(label, () => sql.unsafe(ddl));
  }

  console.log("\n[6/7] Schema evolution — columns added after initial deployment\n");

  // These are already in ensureReadTables but may not exist in older databases
  // that bypassed the code path (e.g. Docker volume created from init.sql only).
  const schemaEvolution = [
    // Columns added after initial change_requests schema
    "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS submitted_at timestamptz",
    "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS change_type_id uuid REFERENCES change_type_config(id) ON DELETE SET NULL",
    "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost numeric(10,2)",
    "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost_currency text NOT NULL DEFAULT 'EUR'",
    "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_lead_days integer",

    // Lead weeks was only in init.sql, not in db.ts DDL — ensure it exists
    "ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS lead_weeks integer NOT NULL DEFAULT 1",
  ];

  for (const ddl of schemaEvolution) {
    const label = ddl.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1] ?? ddl.slice(0, 60);
    await tryRun(label, () => sql.unsafe(ddl));
  }

  console.log("\n[7/7] Adding ON DELETE CASCADE on missing foreign keys\n");

  // Some FK constraints lack ON DELETE CASCADE.  PostgreSQL doesn't allow
  // ALTER TABLE to add ON DELETE CASCADE to an existing constraint, so we
  // have to drop+recreate.  We only do this for FKs where it's safe:
  //
  //   change_requests.client_id → clients(id)
  //     If a client is deleted, all their CRs should cascade.
  //
  // To make this safe, we first check that no orphaned rows exist.

  const cascadeChecks = [
    // change_requests.client_id: verify no orphan rows before dropping constraint
    {
      label: "chk_no_orphan_cr_client_id",
      table: "change_requests",
      fk_name: "change_requests_client_id_fkey",
      checkSql: `SELECT COUNT(*) AS cnt FROM change_requests cr
                 LEFT JOIN clients c ON c.id = cr.client_id
                 WHERE c.id IS NULL`,
      dropSql: "ALTER TABLE change_requests DROP CONSTRAINT IF EXISTS change_requests_client_id_fkey",
      addSql: "ALTER TABLE change_requests ADD CONSTRAINT change_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE",
    },
  ];

  for (const cc of cascadeChecks) {
    // First check for orphans
    try {
      const [row] = await sql`${sql.unsafe(cc.checkSql)}`;
      const orphanCount = Number(row?.cnt ?? 0);
      if (orphanCount > 0) {
        skp(`${cc.label}: ${orphanCount} orphan rows exist — cannot add CASCADE safely`, "orphans");
        continue;
      }

      // Check if constraint currently has CASCADE
      const [fkInfo] = await sql`
        SELECT confdeltype FROM pg_constraint
        WHERE conname = ${cc.fk_name} AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `;
      if (fkInfo?.confdeltype === 'c') {
        skp(cc.label, "already has CASCADE");
        continue;
      }

      // Drop and recreate with CASCADE
      await sql.unsafe(cc.dropSql);
      await sql.unsafe(cc.addSql);
      ok(cc.label);
    } catch (err) {
      fail(cc.label, err);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  Schema Optimization — Summary");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Applied:  ${migrated.length}`);
  console.log(`  Skipped:  ${skipped.length}`);
  console.log(`  Failed:   ${failed.length}`);

  if (migrated.length > 0) {
    console.log("\n  Indexes & constraints created:");
    for (const m of migrated) {
      console.log(`    • ${m}`);
    }
  }
  if (skipped.length > 0) {
    console.log("\n  Skipped (already exist):");
    for (const s of skipped) {
      console.log(`    • ${s.label}: ${s.reason}`);
    }
  }
  if (failed.length > 0) {
    console.log("\n  FAILED:");
    for (const f of failed) {
      console.log(`    • ${f.label}: ${f.error}`);
    }
    process.exitCode = 1;
  }

  await sql.end();
}

await main();
