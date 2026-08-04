import postgres from "postgres";
import { seedClientConfig } from "./seed-client-config.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const REQUIRED_TABLES = [
  "clients",
  "benchmark_catalog",
  "wtp_classifications",
  "portfolios",
  "change_requests",
  "change_request_items",
  "new_benchmark_requests",
  "change_type_config",
  "audit_log",
  "approvals",
  "status_history",
  "notification_config",
  "notification_log",
  "webhook_configs",
  // 3NF lookup tables
  "regeling_types",
  "stakeholders",
];

async function waitForDatabase(url, maxRetries = 12, baseDelayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const probe = postgres(url, { max: 1, connect_timeout: 5 });
    try {
      await probe`SELECT 1`;
      console.log(`[migrate] Database connection established (attempt ${attempt}).`);
      await probe.end();
      return;
    } catch (err) {
      await probe.end({ timeout: 2 }).catch(() => {});
      const delay = baseDelayMs * Math.pow(1.5, attempt - 1); // exponential backoff
      console.log(
        `[migrate] Database not ready (attempt ${attempt}/${maxRetries}): ${
          err instanceof Error ? err.message : err
        } — retrying in ${Math.round(delay / 1000)}s…`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(
    `[migrate] Could not connect to database after ${maxRetries} attempts.`
  );
}

async function main() {
  // 1. Wait for the database to be reachable
  await waitForDatabase(connectionString);

  const sql = postgres(connectionString, { max: 1 });

  try {
    // 2. Create each table independently so a transient failure in one
    //    doesn't block the others.  IF NOT EXISTS makes repeated runs safe.
    const DDL_STATEMENTS = [
      `CREATE TABLE IF NOT EXISTS clients (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        external_reference text NOT NULL UNIQUE,
        regeling_type text,
        asset_class text,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS benchmark_catalog (
        id uuid PRIMARY KEY,
        code text NOT NULL UNIQUE,
        name text NOT NULL,
        asset_class text NOT NULL,
        currency text NOT NULL,
        cost numeric(10,2) NOT NULL DEFAULT 1000.00,
        provider text NOT NULL DEFAULT 'rimes',
        active boolean NOT NULL DEFAULT true,
        lead_weeks integer NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS portfolios (
        id uuid PRIMARY KEY,
        client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name text NOT NULL,
        external_reference text NOT NULL,
        current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
        wtp_classification_id uuid NOT NULL REFERENCES wtp_classifications(id),
        asset_class_id text,
        currency text NOT NULL DEFAULT 'EUR',
        active boolean NOT NULL DEFAULT true,
        asset_class text,
        sub_asset_class text,
        UNIQUE (client_id, external_reference)
      )`,
      `CREATE TABLE IF NOT EXISTS wtp_classifications (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS regeling_types (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        description text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS stakeholders (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS change_requests (
        id uuid PRIMARY KEY,
        reference text NOT NULL UNIQUE,
        change_type text NOT NULL,
        change_type_id uuid REFERENCES change_type_config(id) ON DELETE SET NULL,
        client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        requested_by text NOT NULL,
        rationale text NOT NULL,
        effective_date date NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        sla_lead_weeks integer NOT NULL DEFAULT 1,
        status_updated_at timestamptz NOT NULL DEFAULT now(),
        submitted_at timestamptz,
        fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
        estimated_cost numeric(10,2),
        estimated_cost_currency text NOT NULL DEFAULT 'EUR',
        estimated_lead_days integer,
        processed_at date,
        processed_by text,
        validated_at date,
        validated_by text,
        notification_sent boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_cr_status_values CHECK (
          status IN ('draft','submitted','pending_approval','accepted','approved','rejected','in_progress','processed','validated','failed')
        )
      )`,
      `CREATE TABLE IF NOT EXISTS change_request_items (
        id uuid PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        portfolio_id uuid NOT NULL REFERENCES portfolios(id),
        previous_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
        requested_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
        UNIQUE(change_request_id, portfolio_id)
      )`,
      `CREATE TABLE IF NOT EXISTS new_benchmark_requests (
        id uuid PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        short_name text NOT NULL,
        long_name text NOT NULL,
        asset_class text NOT NULL,
        currency text NOT NULL DEFAULT 'EUR',
        estimated_cost numeric(10,2) NOT NULL DEFAULT 5000.00,
        estimated_lead_weeks integer NOT NULL DEFAULT 4
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id text PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        action text NOT NULL,
        actor text NOT NULL,
        previous_status text,
        new_status text NOT NULL,
        diff_snapshot jsonb,
        client_config_version text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS approvals (
        id text PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        approver text NOT NULL,
        decision text NOT NULL,
        remarks text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS notification_config (
        id uuid PRIMARY KEY,
        stakeholder text NOT NULL,
        channel text NOT NULL CHECK (channel IN ('webhook', 'email')),
        recipient text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        change_request_id uuid REFERENCES change_requests(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_config_app ON notification_config (stakeholder, channel) WHERE change_request_id IS NULL`,
      `CREATE TABLE IF NOT EXISTS notification_log (
        id uuid PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        stakeholder text NOT NULL,
        channel text NOT NULL CHECK (channel IN ('webhook', 'email')),
        recipient text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3,
        response text,
        next_retry_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS change_type_config (
        id uuid PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        extended_explanation text,
        category text NOT NULL DEFAULT 'general',
        fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        ist_soll_mapping jsonb,
        cost jsonb NOT NULL DEFAULT '{}'::jsonb,
        default_lead_days integer NOT NULL DEFAULT 5,
        stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
        workflow text NOT NULL DEFAULT 'default',
        process_flow jsonb NOT NULL DEFAULT '[]'::jsonb,
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS status_history (
        id uuid PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        from_status text,
        to_status text NOT NULL,
        changed_by text,
        changed_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS webhook_configs (
        id text PRIMARY KEY,
        name text NOT NULL,
        url text NOT NULL,
        secret text,
        events jsonb NOT NULL DEFAULT '[]'::jsonb,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    ];

    let createdCount = 0;
    let failedCount = 0;

    for (const ddl of DDL_STATEMENTS) {
      try {
        await sql.unsafe(ddl);
        createdCount++;
      } catch (err) {
        failedCount++;
        console.error(
          `[migrate] Failed to create table: ${
            err instanceof Error ? err.message : err
          }`
        );
      }
    }

    console.log(
      `[migrate] Tables: ${createdCount} created/verified, ${failedCount} failed.`
    );

    // 3. Verify every required table actually exists
    const present = new Set();
    try {
      const rows = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      for (const row of rows) {
        present.add(String(row.table_name));
        console.log(`[migrate] Found existing table: ${String(row.table_name)}`);
      }
    } catch (e) {
      console.warn(
        "[migrate] Could not verify table existence (information_schema query failed):",
        e instanceof Error ? e.message : e
      );
    }

    if (present.size > 0) {
      const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
      if (missing.length > 0) {
        console.error(
          `[migrate] MISSING TABLES: ${missing.join(
            ", "
          )} — the application may not work correctly.`
        );
        // 4. Retry missing tables one more time, with schema qualification
        for (const table of missing) {
          const index = REQUIRED_TABLES.indexOf(table);
          if (index !== -1) {
            const ddl = DDL_STATEMENTS[index].replace(
              /CREATE TABLE IF NOT EXISTS /,
              "CREATE TABLE IF NOT EXISTS public."
            );
            console.log(`[migrate] Retrying table "${table}" with schema qualification…`);
            try {
              await sql.unsafe(ddl);
              console.log(`[migrate] Table "${table}" created on retry.`);
            } catch (err2) {
              console.error(
                `[migrate] Retry failed for "${table}": ${
                  err2 instanceof Error ? err2.message : err2
                }`
              );
            }
          }
        }
      } else {
        console.log(
          `[migrate] All ${REQUIRED_TABLES.length} required tables present.`
        );
      }
    }

    console.log("Database schema is ready.");

    // ── Column migration: add columns that may be missing on older deployments ──
    // Uses schema introspection to skip columns that already exist, avoiding the
    // PostgreSQL NOTICE ("column already exists, skipping") on every restart.

    async function ensureColumn(sql, table, column, ddl) {
      const rows = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
      `;
      if (rows.length === 0) {
        await sql.unsafe(ddl);
        console.log(`[migrate] Added column ${column} to ${table}.`);
      }
    }

    // Generic change-type model columns for change_requests
    const changeRequestMigrations = [
      ['change_type_id', `ALTER TABLE change_requests ADD COLUMN change_type_id uuid REFERENCES change_type_config(id) ON DELETE SET NULL`],
      ['fields', `ALTER TABLE change_requests ADD COLUMN fields jsonb NOT NULL DEFAULT '[]'::jsonb`],
      ['stakeholders', `ALTER TABLE change_requests ADD COLUMN stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb`],
      ['estimated_cost', `ALTER TABLE change_requests ADD COLUMN estimated_cost numeric(10,2)`],
      ['estimated_cost_currency', `ALTER TABLE change_requests ADD COLUMN estimated_cost_currency text NOT NULL DEFAULT 'EUR'`],
      ['estimated_lead_days', `ALTER TABLE change_requests ADD COLUMN estimated_lead_days integer`],
    ];
    for (const [col, ddl] of changeRequestMigrations) {
      await ensureColumn(sql, 'change_requests', col, ddl);
    }

    // Portfolio attribute FK column migrations
    await sql.unsafe(`ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS portfolios_asset_class_id_fkey`).catch(() => {});
    await sql.unsafe(`ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS portfolios_sub_asset_class_id_fkey`).catch(() => {});
    await sql.unsafe(`ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_asset_class_id_fkey`).catch(() => {});
    await sql.unsafe(`ALTER TABLE benchmark_catalog DROP CONSTRAINT IF EXISTS benchmark_catalog_asset_class_id_fkey`).catch(() => {});
    await sql.unsafe(`ALTER TABLE new_benchmark_requests DROP CONSTRAINT IF EXISTS new_benchmark_requests_asset_class_id_fkey`).catch(() => {});
    const portfolioMigrations = [
      ['wtp_classification_id', `ALTER TABLE portfolios ADD COLUMN wtp_classification_id uuid REFERENCES wtp_classifications(id)`],
      ['asset_class_id', `ALTER TABLE portfolios ADD COLUMN asset_class_id text`],
    ];
    for (const [col, ddl] of portfolioMigrations) {
      await ensureColumn(sql, 'portfolios', col, ddl);
    }
    await sql.unsafe(`ALTER TABLE portfolios ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`).catch(() => {});
    await sql.unsafe(`ALTER TABLE portfolios DROP COLUMN IF EXISTS manager_id`).catch(() => {});
    await sql.unsafe(`ALTER TABLE portfolios DROP COLUMN IF EXISTS benchmark_id`).catch(() => {});
    await sql.unsafe(`DROP TABLE IF EXISTS managers CASCADE`).catch(() => {});
    await sql.unsafe(`DROP TABLE IF EXISTS benchmarks CASCADE`).catch(() => {});

    // Backfill existing portfolio rows with default FK values (columns must exist before backfill)
    try {
      const defaultWtpId = '00000001-0000-4000-a000-000000000001';
      const defaultAssetClassId = '00000002-0000-4000-a000-000000000001';
      const backfill = await sql.unsafe(`
        UPDATE portfolios SET
          wtp_classification_id = COALESCE(wtp_classification_id, '${defaultWtpId}'),
          asset_class_id = COALESCE(asset_class_id, '${defaultAssetClassId}')
        WHERE wtp_classification_id IS NULL
           OR asset_class_id IS NULL
      `);
      if (backfill.count > 0) {
        console.log(`[migrate] Portfolio FK backfill: ${backfill.count} rows updated.`);
      }
    } catch (err) {
      console.warn(`[migrate] Portfolio backfill: ${err instanceof Error ? err.message : err}`);
    }

    // SET NOT NULL on portfolio FK columns (backfill must run first)
    const notNullColumns = [
      `ALTER TABLE portfolios ALTER COLUMN wtp_classification_id SET NOT NULL`,
    ];
    for (const ddl of notNullColumns) {
      try { await sql.unsafe(ddl); } catch (err) {
        console.warn(`[migrate] SET NOT NULL: ${err instanceof Error ? err.message : err}`);
      }
    }
    // ── 3NF Normalization Migration ────────────────────────────────────────
    // Resolves 8 transitive dependency violations by replacing free-text
    // columns with FK references to canonical lookup tables.

    // 3b. Seed new lookup tables (idempotent — ON CONFLICT DO NOTHING)
    const seedNewLookups = [
      `INSERT INTO regeling_types (id, name, description) VALUES
        ('b0000000-0000-4000-a000-000000000001', 'pensioenuitkering', 'Beschikbare premieregeling — uitkeringsfase'),
        ('b0000000-0000-4000-a000-000000000002', 'premieovereenkomst', 'Beschikbare premieregeling — opbouwfase'),
        ('b0000000-0000-4000-a000-000000000003', 'kapitaalovereenkomst', 'Vaste toegezegde kapitaalregeling'),
        ('b0000000-0000-4000-a000-000000000004', 'uitkeringsovereenkomst', 'Vaste toegezegde uitkeringsregeling (eindloon/middelloon)')
       ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO stakeholders (id, name) VALUES
        ('c0000000-0000-4000-a000-000000000001', 'Portefeuillebeheerder'),
        ('c0000000-0000-4000-a000-000000000002', 'Risk manager'),
        ('c0000000-0000-4000-a000-000000000003', 'Fiduciair manager'),
        ('c0000000-0000-4000-a000-000000000004', 'Klant'),
        ('c0000000-0000-4000-a000-000000000005', 'Compliance'),
        ('c0000000-0000-4000-a000-000000000006', 'Juridisch'),
        ('c0000000-0000-4000-a000-000000000007', 'Financieel adviseur'),
        ('c0000000-0000-4000-a000-000000000008', 'Beleggingscommissie')
       ON CONFLICT (id) DO NOTHING`,
    ];
    for (const ddl of seedNewLookups) {
      try { await sql.unsafe(ddl); } catch (err) {
        console.warn(`[migrate] Lookup seed: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log("[migrate] Non-asset lookup tables seeded.");

    // 3d. Add FK columns + backfill data + SET NOT NULL
    //
    // clients: regeling_type → regeling_type_id, asset_class → asset_class_id
    await ensureColumn(sql, 'clients', 'regeling_type_id', `ALTER TABLE clients ADD COLUMN regeling_type_id uuid REFERENCES regeling_types(id)`);
    await ensureColumn(sql, 'clients', 'asset_class_id', `ALTER TABLE clients ADD COLUMN asset_class_id text`);
    await sql.unsafe(`ALTER TABLE clients ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`).catch(() => {});
    // (No data backfill for clients — the old text columns were free-form; seed data used NULL)

    // portfolios: sub_asset_class → sub_asset_class_id
    await ensureColumn(sql, 'portfolios', 'sub_asset_class_id', `ALTER TABLE portfolios ADD COLUMN sub_asset_class_id text`);
    await sql.unsafe(`ALTER TABLE portfolios ALTER COLUMN sub_asset_class_id TYPE text USING sub_asset_class_id::text`).catch(() => {});

    // benchmark_catalog: asset_class → asset_class_id
    await ensureColumn(sql, 'benchmark_catalog', 'asset_class_id', `ALTER TABLE benchmark_catalog ADD COLUMN asset_class_id text`);
    await sql.unsafe(`ALTER TABLE benchmark_catalog ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`).catch(() => {});
    try {
      const bcResult = await sql.unsafe(`
        UPDATE benchmark_catalog bc
        SET asset_class_id = ac.asset_class_id::text
        FROM client_config.asset_class ac
        WHERE (bc.asset_class = ac.asset_class_name OR bc.asset_class = ac.asset_class_code)
          AND bc.asset_class_id IS NULL
      `);
      console.log("[migrate] benchmark_catalog.asset_class_id backfilled:", bcResult.count, "rows.");
    } catch (err) {
      console.warn("[migrate] benchmark_catalog.asset_class_id backfill:", err instanceof Error ? err.message : err);
    }

    // new_benchmark_requests: asset_class → asset_class_id
    await ensureColumn(sql, 'new_benchmark_requests', 'asset_class_id', `ALTER TABLE new_benchmark_requests ADD COLUMN asset_class_id text`);
    await sql.unsafe(`ALTER TABLE new_benchmark_requests ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`).catch(() => {});
    try {
      const nbrResult = await sql.unsafe(`
        UPDATE new_benchmark_requests nbr
        SET asset_class_id = ac.asset_class_id::text
        FROM client_config.asset_class ac
        WHERE (nbr.asset_class = ac.asset_class_name OR nbr.asset_class = ac.asset_class_code)
          AND nbr.asset_class_id IS NULL
      `);
      console.log("[migrate] new_benchmark_requests.asset_class_id backfilled:", nbrResult.count, "rows.");
    } catch (err) {
      console.warn("[migrate] new_benchmark_requests.asset_class_id backfill:", err instanceof Error ? err.message : err);
    }

    // change_requests: make change_type_id required (data migrated during earlier column migration)
    try {
      // Backfill any remaining NULL change_type_id from change_type text
      await sql.unsafe(`
        UPDATE change_requests cr
        SET change_type_id = sub.ctc_id
        FROM (
          SELECT cr2.id AS cr_id, ctc.id AS ctc_id
          FROM change_requests cr2
          JOIN change_type_config ctc ON ctc.name = cr2.change_type
          WHERE cr2.change_type_id IS NULL
        ) sub
        WHERE cr.id = sub.cr_id
      `);
      // Ensure extended_explanation column exists (needed by runtime seedChangeTypeConfigs)
      await sql.unsafe(`
        ALTER TABLE change_type_config
        ADD COLUMN IF NOT EXISTS extended_explanation text
      `);
      // Seed canonical change type configs so subsequent FK references work
      await sql.unsafe(`
        INSERT INTO change_type_config (id, slug, name, description, category, fields, cost, default_lead_days, stakeholders, workflow, process_flow, active, sort_order, created_at, updated_at) VALUES
        ('a0000000-0000-0000-0000-000000000001', 'benchmark_switch', 'Benchmarkwissel', 'Wijzig de benchmark van een portefeuille naar een andere benchmark', 'benchmark', '[]'::jsonb, '{\"baseCost\":0,\"costCurrency\":\"EUR\",\"perItemCost\":500,\"description\":\"€500 per portefeuille\"}'::jsonb, 7, '[]'::jsonb, 'benchmark_switch', '[]'::jsonb, true, 10, now(), now()),
        ('a0000000-0000-0000-0000-000000000002', 'new_benchmark', 'Nieuwe benchmark', 'Voeg een nieuwe benchmark toe aan de catalogus', 'benchmark', '[]'::jsonb, '{\"baseCost\":5000,\"costCurrency\":\"EUR\",\"description\":\"€5.000 eenmalige kost\"}'::jsonb, 28, '[]'::jsonb, 'new_benchmark', '[]'::jsonb, true, 20, now(), now()),
        ('a0000000-0000-0000-0000-000000000003', 'fee_change', 'Tariefwijziging', 'Wijzig de beheervergoeding voor een portefeuille', 'fee', '[]'::jsonb, '{\"baseCost\":250,\"costCurrency\":\"EUR\",\"description\":\"€250 vaste kost\"}'::jsonb, 10, '[]'::jsonb, 'fee_change', '[]'::jsonb, true, 30, now(), now()),
        ('a0000000-0000-0000-0000-000000000004', 'mandate_change', 'Mandaatwijziging', 'Wijzig de mandaatvoorwaarden van een portefeuille', 'mandate', '[]'::jsonb, '{\"baseCost\":350,\"costCurrency\":\"EUR\",\"description\":\"€350 vaste kost\"}'::jsonb, 14, '[]'::jsonb, 'mandate_change', '[]'::jsonb, true, 40, now(), now()),
        ('a0000000-0000-0000-0000-000000000005', 'custodian_change', 'Custodianwijziging', 'Wijzig de custodian van een portefeuille', 'custodian', '[]'::jsonb, '{\"baseCost\":200,\"costCurrency\":\"EUR\",\"description\":\"€200 vaste kost\"}'::jsonb, 21, '[]'::jsonb, 'custodian_change', '[]'::jsonb, true, 50, now(), now()),
        ('a0000000-0000-0000-0000-000000000006', 'rebalance_trigger', 'Herbalanceringsdrempel', 'Stel een herbalanceringsdrempel of -frequentie in', 'rebalance', '[]'::jsonb, '{\"baseCost\":150,\"costCurrency\":\"EUR\",\"description\":\"€150 vaste kost\"}'::jsonb, 5, '[]'::jsonb, 'rebalance_trigger', '[]'::jsonb, true, 60, now(), now()),
        ('a0000000-0000-0000-0000-000000000007', 'customer_onboarding', 'Nieuwe klant', 'Onboard een nieuwe klant met FPR/SPR regeling en portfolio''s', 'client', '[]'::jsonb, '{\"baseCost\":0,\"costCurrency\":\"EUR\",\"description\":\"Geen kosten\"}'::jsonb, 1, '[]'::jsonb, 'customer_onboarding', '[]'::jsonb, true, 5, now(), now()),
        ('a0000000-0000-0000-0000-000000000008', 'portfolio_addition', 'Nieuwe portfolio toevoegen', 'Voeg een nieuwe portefeuille toe aan een bestaande cliënt', 'portfolio', '[]'::jsonb, '{\"baseCost\":500,\"costCurrency\":\"EUR\",\"description\":\"€500 vaste kost voor toevoegen van een portefeuille\"}'::jsonb, 5, '[]'::jsonb, 'portfolio_addition', '[]'::jsonb, true, 7, now(), now()),
        ('a0000000-0000-0000-0000-000000000009', 'new_asset_class', 'Nieuwe asset class', 'Voeg een nieuwe asset class toe aan de client-config referentiedata', 'mandate', '[]'::jsonb, '{\"baseCost\":2500,\"costCurrency\":\"EUR\",\"description\":\"€2.500 eenmalige kost\"}'::jsonb, 21, '[]'::jsonb, 'new_asset_class', '[]'::jsonb, true, 25, now(), now()),
        ('a0000000-0000-0000-0000-000000000010', 'new_sub_asset_class', 'Nieuwe sub asset class', 'Voeg een nieuwe sub asset class toe onder een bestaande asset class', 'mandate', '[]'::jsonb, '{\"baseCost\":1500,\"costCurrency\":\"EUR\",\"description\":\"€1.500 eenmalige kost\"}'::jsonb, 14, '[]'::jsonb, 'new_sub_asset_class', '[]'::jsonb, true, 26, now(), now()),
        ('a0000000-0000-0000-0000-000000000011', 'client_onboarding', 'Nieuwe klant (client onboarding)', 'Onboard een nieuwe pensioenklant met eerste portfolio-configuratie', 'client', '[]'::jsonb, '{"baseCost":0,"costCurrency":"EUR","description":"Geen kosten"}'::jsonb, 1, '[]'::jsonb, 'client_onboarding', '[]'::jsonb, true, 6, now(), now()),
        ('a0000000-0000-0000-0000-000000000012', 'portfolio_configuration_create', 'Portefeuilleconfiguratie toevoegen', 'Voeg een nieuwe portefeuilleconfiguratie (rekeningregel) toe aan een bestaande cliënt', 'portfolio', '[]'::jsonb, '{"baseCost":500,"costCurrency":"EUR","description":"€500 vaste kost voor toevoegen van een portefeuilleconfiguratie"}'::jsonb, 5, '[]'::jsonb, 'portfolio_configuration_create', '[]'::jsonb, true, 8, now(), now()),
        ('a0000000-0000-0000-0000-000000000013', 'portfolio_configuration_update', 'Portefeuilleconfiguratie wijzigen', 'Wijzig attributen van een bestaande portefeuilleconfiguratie (benchmark, NPC, namen, datums)', 'portfolio', '[]'::jsonb, '{"baseCost":250,"costCurrency":"EUR","description":"€250 vaste kost voor het wijzigen van een portefeuilleconfiguratie"}'::jsonb, 5, '[]'::jsonb, 'portfolio_configuration_update', '[]'::jsonb, true, 9, now(), now()),
        ('a0000000-0000-0000-0000-000000000014', 'portfolio_configuration_retire', 'Portefeuilleconfiguratie beëindigen', 'Beëindig (retire) een bestaande portefeuilleconfiguratie', 'portfolio', '[]'::jsonb, '{"baseCost":100,"costCurrency":"EUR","description":"€100 vaste kost voor het beëindigen van een portefeuilleconfiguratie"}'::jsonb, 3, '[]'::jsonb, 'portfolio_configuration_retire', '[]'::jsonb, true, 10, now(), now())
        ON CONFLICT (slug) DO UPDATE SET
          id = EXCLUDED.id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          updated_at = now()
      `);
      await sql.unsafe(`
        UPDATE change_type_config
        SET active = false, updated_at = now()
        WHERE slug <> 'benchmark_switch'
          AND active = true
      `);
      // Auto-create config entries for orphan change types (change_type values not
      // matched by the canonical set above, e.g. legacy free-text values)
      await sql.unsafe(`
        WITH orphan_vals AS (
          SELECT DISTINCT cr.change_type AS val
          FROM change_requests cr
          WHERE cr.change_type_id IS NULL AND cr.change_type IS NOT NULL
        ),
        new_configs AS (
          INSERT INTO change_type_config (id, slug, name, description)
          SELECT
            gen_random_uuid(),
            lower(regexp_replace(ov.val, '[^a-zA-Z0-9_]+', '-', 'g')),
            ov.val,
            'Auto-created during 3NF migration — legacy change type'
          FROM orphan_vals ov
          ON CONFLICT (slug) DO NOTHING
          RETURNING id, name
        )
        UPDATE change_requests cr
        SET change_type_id = nc.id
        FROM new_configs nc
        WHERE cr.change_type = nc.name AND cr.change_type_id IS NULL
      `);
      await sql.unsafe(`ALTER TABLE change_requests ALTER COLUMN change_type_id SET NOT NULL`);
      console.log("[migrate] change_requests.change_type_id enforced NOT NULL.");
    } catch (err) {
      console.warn("[migrate] change_requests.change_type_id migration:", err instanceof Error ? err.message : err);
    }

    // notification_config + notification_log: stakeholder → stakeholder_id
    await ensureColumn(sql, 'notification_config', 'stakeholder_id', `ALTER TABLE notification_config ADD COLUMN stakeholder_id uuid REFERENCES stakeholders(id)`);
    await ensureColumn(sql, 'notification_log', 'stakeholder_id', `ALTER TABLE notification_log ADD COLUMN stakeholder_id uuid REFERENCES stakeholders(id)`);
    try {
      // Backfill notification_config
      await sql.unsafe(`
        WITH config_orphans AS (
          INSERT INTO stakeholders (id, name)
          SELECT gen_random_uuid(), nc.stakeholder
          FROM notification_config nc
          WHERE nc.stakeholder_id IS NULL
          ON CONFLICT (name) DO NOTHING
          RETURNING id, name
        )
        UPDATE notification_config nc
        SET stakeholder_id = COALESCE(
          (SELECT co.id FROM config_orphans co WHERE co.name = nc.stakeholder),
          (SELECT s.id FROM stakeholders s WHERE s.name = nc.stakeholder)
        )
        WHERE nc.stakeholder_id IS NULL
      `);
      // Backfill notification_log
      await sql.unsafe(`
        WITH log_orphans AS (
          INSERT INTO stakeholders (id, name)
          SELECT gen_random_uuid(), nl.stakeholder
          FROM notification_log nl
          WHERE nl.stakeholder_id IS NULL
          ON CONFLICT (name) DO NOTHING
          RETURNING id, name
        )
        UPDATE notification_log nl
        SET stakeholder_id = COALESCE(
          (SELECT lo.id FROM log_orphans lo WHERE lo.name = nl.stakeholder),
          (SELECT s.id FROM stakeholders s WHERE s.name = nl.stakeholder)
        )
        WHERE nl.stakeholder_id IS NULL
      `);
      // Make NOT NULL where possible (may fail on existing data — warn, don't crash)
      try {
        await sql.unsafe(`ALTER TABLE notification_config ALTER COLUMN stakeholder_id SET NOT NULL`);
      } catch (e) {
        console.warn("[migrate] Could not SET NOT NULL on notification_config.stakeholder_id — some rows may be null.");
      }
      try {
        await sql.unsafe(`ALTER TABLE notification_log ALTER COLUMN stakeholder_id SET NOT NULL`);
      } catch (e) {
        console.warn("[migrate] Could not SET NOT NULL on notification_log.stakeholder_id — some rows may be null.");
      }
      console.log("[migrate] Notification stakeholder_id columns backfilled.");
    } catch (err) {
      console.warn("[migrate] Notification stakeholder migration:", err instanceof Error ? err.message : err);
    }

    // 3e. Drop old text columns (safe: data is now in FK columns)
    // NOTE: We keep the old columns in this migration pass for backward compatibility.
    // They will be dropped in a future migration after the application code no longer
    // references them. If you want to drop them now, uncomment:
    // await sql.unsafe(`ALTER TABLE clients DROP COLUMN IF EXISTS regeling_type`);
    // await sql.unsafe(`ALTER TABLE clients DROP COLUMN IF EXISTS asset_class`);
    // await sql.unsafe(`ALTER TABLE portfolios DROP COLUMN IF EXISTS asset_class`);
    // await sql.unsafe(`ALTER TABLE portfolios DROP COLUMN IF EXISTS sub_asset_class`);
    // await sql.unsafe(`ALTER TABLE benchmark_catalog DROP COLUMN IF EXISTS asset_class`);
    // await sql.unsafe(`ALTER TABLE new_benchmark_requests DROP COLUMN IF EXISTS asset_class`);
    // await sql.unsafe(`ALTER TABLE change_requests DROP COLUMN IF EXISTS change_type`);
    // await sql.unsafe(`ALTER TABLE notification_config DROP COLUMN IF EXISTS stakeholder`);
    // await sql.unsafe(`ALTER TABLE notification_log DROP COLUMN IF EXISTS stakeholder`);

    // 3f. Create FK indexes for new columns
    const fkIndexStatements = [
      `CREATE INDEX IF NOT EXISTS idx_p_sub_asset_class_id ON portfolios (sub_asset_class_id)`,
      `CREATE INDEX IF NOT EXISTS idx_bc_asset_class_id ON benchmark_catalog (asset_class_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nbr_asset_class_id ON new_benchmark_requests (asset_class_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nc_stakeholder_id ON notification_config (stakeholder_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nl_stakeholder_id ON notification_log (stakeholder_id)`,
      `CREATE INDEX IF NOT EXISTS idx_clients_asset_class_id ON clients (asset_class_id)`,
      `CREATE INDEX IF NOT EXISTS idx_clients_regeling_type_id ON clients (regeling_type_id)`,
    ];
    for (const ddl of fkIndexStatements) {
      try { await sql.unsafe(ddl); } catch (err) {
        console.warn(`[migrate] FK index: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log("[migrate] 3NF FK indexes created.");

    // ── End 3NF Migration ──────────────────────────────────────────────────

    // 4. Apply performance indexes (columns are guaranteed to exist by this point)
    const INDEX_STATEMENTS = [
      // Foreign key indexes
      `CREATE INDEX IF NOT EXISTS idx_cr_client_id ON change_requests (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cr_change_type_id ON change_requests (change_type_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cri_change_request_id ON change_request_items (change_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cri_portfolio_id ON change_request_items (portfolio_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cri_previous_benchmark_id ON change_request_items (previous_benchmark_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cri_requested_benchmark_id ON change_request_items (requested_benchmark_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nbr_change_request_id ON new_benchmark_requests (change_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_al_change_request_id ON audit_log (change_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_app_change_request_id ON approvals (change_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nc_change_request_id ON notification_config (change_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nl_change_request_id ON notification_log (change_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sh_change_request_id ON status_history (change_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_p_client_id ON portfolios (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_p_wtp_classification_id ON portfolios (wtp_classification_id)`,
      `CREATE INDEX IF NOT EXISTS idx_p_asset_class_id ON portfolios (asset_class_id)`,
      // Filter / sort indexes
      `CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests (status)`,
      `CREATE INDEX IF NOT EXISTS idx_cr_created_at ON change_requests (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_cr_change_type ON change_requests (change_type)`,
      `CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status)`,
      `CREATE INDEX IF NOT EXISTS idx_bc_active ON benchmark_catalog (active)`,
      `CREATE INDEX IF NOT EXISTS idx_bc_asset_class ON benchmark_catalog (asset_class)`,
      `CREATE INDEX IF NOT EXISTS idx_p_active ON portfolios (active)`,
      `CREATE INDEX IF NOT EXISTS idx_nl_status ON notification_log (status)`,
      `CREATE INDEX IF NOT EXISTS idx_nc_is_active ON notification_config (is_active)`,
      `CREATE INDEX IF NOT EXISTS idx_ctc_active ON change_type_config (active)`,
      `CREATE INDEX IF NOT EXISTS idx_ctc_slug ON change_type_config (slug)`,
      // Composite indexes for common query patterns
      `CREATE INDEX IF NOT EXISTS idx_cr_client_created ON change_requests (client_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_cr_status_created ON change_requests (status, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_cr_client_status_created ON change_requests (client_id, status, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_p_client_active_name ON portfolios (client_id, active, name)`,
    ];
    let indexCount = 0;
    let indexFailed = 0;
    for (const ddl of INDEX_STATEMENTS) {
      try {
        await sql.unsafe(ddl);
        indexCount++;
      } catch (err) {
        indexFailed++;
        console.error(`[migrate] Failed to create index: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[migrate] Indexes: ${indexCount} created/verified, ${indexFailed} failed.`);

    // 5. Apply SLA status caching columns and trigger
    const SLA_MIGRATIONS = [
      `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_status text`,
      `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_days_open integer`,
    ];
    for (const ddl of SLA_MIGRATIONS) {
      try {
        await sql.unsafe(ddl);
        console.log(`[migrate] SLA column applied: ${ddl.split(' ').pop()}`);
      } catch (err) {
        console.error(`[migrate] Failed SLA migration: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Create trigger function and trigger (idempotent)
    try {
      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION update_sla_status_trigger() RETURNS trigger AS $$
        DECLARE
          days_open integer;
          sla_days integer;
          remaining integer;
        BEGIN
          IF NEW.status IN ('validated', 'processed') THEN
            NEW.sla_status := 'ok';
            NEW.sla_days_open := GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.created_at))::int / 86400);
            RETURN NEW;
          END IF;
          days_open := GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.created_at))::int / 86400);
          sla_days := NEW.sla_lead_weeks * 7;
          remaining := sla_days - days_open;
          IF remaining <= 0 THEN
            NEW.sla_status := 'overdue';
          ELSIF remaining <= CEIL(sla_days * 0.25) THEN
            NEW.sla_status := 'at_risk';
          ELSE
            NEW.sla_status := 'ok';
          END IF;
          NEW.sla_days_open := days_open;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await sql.unsafe(`DROP TRIGGER IF EXISTS trg_change_requests_sla ON change_requests`);
      await sql.unsafe(`
        CREATE TRIGGER trg_change_requests_sla
          BEFORE INSERT OR UPDATE OF status, created_at, sla_lead_weeks
          ON change_requests
          FOR EACH ROW
          EXECUTE FUNCTION update_sla_status_trigger()
      `);
      console.log(`[migrate] SLA trigger created/verified.`);
    } catch (err) {
      console.error(`[migrate] Failed to create SLA trigger: ${err instanceof Error ? err.message : err}`);
    }

    // 6. Apply initial SLA values for existing rows (one-time backfill)
    try {
      const result = await sql.unsafe(`
        UPDATE change_requests
        SET
          sla_status = CASE
            WHEN status IN ('validated', 'processed') THEN 'ok'
            WHEN (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) >= (sla_lead_weeks * 7) THEN 'overdue'
            WHEN (sla_lead_weeks * 7) - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) <= CEIL(sla_lead_weeks * 7 * 0.25) THEN 'at_risk'
            ELSE 'ok'
          END,
          sla_days_open = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400)
        WHERE sla_status IS NULL
      `);
      console.log(`[migrate] SLA backfill: ${result.count} rows updated.`);
    } catch (err) {
      console.error(`[migrate] Failed SLA backfill: ${err instanceof Error ? err.message : err}`);
    }

    // ── Client Config Schema (3NF model from clientconfig_schema.sql) ─────
    // Creates a separate `client_config` schema with its own lookup tables for
    // legal entities, parent accounts, portfolios, asset classes, managers,
    // benchmarks, models, classifications, strategies, and a validated account
    // table.  All DDL uses IF NOT EXISTS so repeated runs are safe.

    const CC_SCHEMA = "client_config";

    // 7a. Create the schema itself
    try {
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${CC_SCHEMA}`);
      console.log("[migrate] client_config schema created/verified.");
    } catch (err) {
      console.warn(`[migrate] Could not create client_config schema: ${err instanceof Error ? err.message : err}`);
    }

    // 7b. Create tables — each qualified with the schema name, using IF NOT EXISTS guards.
    //     Dependency order matters for FK references.
    const CC_TABLES = [
      // Independent tables (no FKs)
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.legal_entity (
        legal_entity_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        legal_name varchar(100) NOT NULL UNIQUE CHECK (legal_name ~ '^[^\\r\\n]{1,100}$')
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.parent_account (
        parent_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        parent_account_code varchar(16) NOT NULL UNIQUE CHECK (parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
        msa_parent_account_code varchar(16) CHECK (msa_parent_account_code IS NULL OR msa_parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$')
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.client (
        client_code varchar(3) PRIMARY KEY CHECK (client_code ~ '^[A-Z0-9]{1,3}$'),
        client_name varchar(100) NOT NULL UNIQUE CHECK (client_name ~ '^[^\\r\\n]{1,100}$')
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.asset_class (
        asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        asset_class_code char(2) NOT NULL UNIQUE CHECK (asset_class_code ~ '^[A-Z]{2}$'),
        asset_class_name varchar(30) NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.manager (
        manager_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        manager_code char(3) NOT NULL UNIQUE CHECK (manager_code ~ '^[A-Z0-9]{3}$'),
        manager_name varchar(50) NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.benchmark (
        benchmark_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        benchmark_code varchar(60) NOT NULL UNIQUE,
        benchmark_name varchar(100),
        rimes_code varchar(40)
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.model (
        model_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        model_code varchar(10) NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.classification (
        classification_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        classification_code varchar(10) NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.strategy (
        strategy_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        strategy_name varchar(30) NOT NULL UNIQUE
      )`,
      // Tables with FKs to parent_account
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.portfolio (
        portfolio_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        portfolio_code varchar(15) NOT NULL UNIQUE CHECK (portfolio_code ~ '^[A-Z0-9]{2,15}$'),
        parent_account_id bigint REFERENCES ${CC_SCHEMA}.parent_account
      )`,
      // Tables with FKs to asset_class
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.sub_asset_class (
        sub_asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        asset_class_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.asset_class,
        sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
        sub_asset_class_name varchar(100) NOT NULL,
        sort_order integer,
        UNIQUE(asset_class_id, sub_asset_class_code),
        UNIQUE(asset_class_id, sub_asset_class_name)
      )`,
      // Tables with FKs to strategy
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.sub_strategy (
        sub_strategy_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        strategy_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.strategy,
        sub_strategy_name varchar(50) NOT NULL,
        UNIQUE(strategy_id, sub_strategy_name)
      )`,
      // Account — depends on all the above
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.account (
        primary_account_id varchar(13) PRIMARY KEY CHECK (primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$'),
        client_code varchar(3) NOT NULL REFERENCES ${CC_SCHEMA}.client(client_code),
        portfolio_id bigint NOT NULL REFERENCES ${CC_SCHEMA}.portfolio,
        asset_class_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.asset_class,
        sub_asset_class_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.sub_asset_class,
        manager_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.manager,
        legal_entity_id bigint REFERENCES ${CC_SCHEMA}.legal_entity,
        additional_code varchar(3),
        long_name varchar(50) NOT NULL,
        short_name varchar(30) NOT NULL,
        model_id bigint REFERENCES ${CC_SCHEMA}.model,
        classification_id smallint REFERENCES ${CC_SCHEMA}.classification,
        strategy_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.strategy,
        sub_strategy_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.sub_strategy,
        benchmark_id bigint REFERENCES ${CC_SCHEMA}.benchmark,
        UNIQUE(client_code, asset_class_id, sub_asset_class_id, manager_id)
      )`,
    ];

    let ccTableCount = 0;
    let ccTableFailed = 0;
    for (const ddl of CC_TABLES) {
      try {
        await sql.unsafe(ddl);
        ccTableCount++;
      } catch (err) {
        ccTableFailed++;
        console.error(`[migrate] CC table: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[migrate] Client-config tables: ${ccTableCount} created/verified, ${ccTableFailed} failed.`);

    await sql.unsafe(`ALTER TABLE ${CC_SCHEMA}.sub_asset_class ALTER COLUMN sub_asset_class_name TYPE varchar(100)`);
    await sql.unsafe(`ALTER TABLE ${CC_SCHEMA}.sub_asset_class ADD COLUMN IF NOT EXISTS sort_order integer`);

    // 7c. Seed asset_class + sub_asset_class lookup data (idempotent)
    try {
      await sql.unsafe(`
        WITH source(asset_code, asset_name, sub_code, sub_name, sort_order) AS (VALUES
          ('CS', 'CASH', 'CAS', 'CASH', 1),
          ('CS', 'CASH', 'FUN', 'FUNDS', 2),
          ('CS', 'CASH', 'LIQ', 'LIQUIDITIES', 3),
          ('AL', 'ALTERNATIVES', 'PRI', 'PRIVATE EQUITY', 1),
          ('AL', 'ALTERNATIVES', 'HED', 'HEDGE FUNDS', 2),
          ('AL', 'ALTERNATIVES', 'PEI', 'PRIVATE EQUITY IMPACT', 3),
          ('AL', 'ALTERNATIVES', 'HFC', 'HEDGE FUNDS CTA', 4),
          ('AL', 'ALTERNATIVES', 'HFG', 'HEDGE FUNDS GLOBAL MACRO', 5),
          ('AL', 'ALTERNATIVES', 'ILS', 'INFLATION LINKED SECURITIES', 6),
          ('AL', 'ALTERNATIVES', 'GOL', 'GOLD', 7),
          ('AL', 'ALTERNATIVES', 'RIS', 'RISK PARITY', 8),
          ('AL', 'ALTERNATIVES', 'RIP', 'RISK PREMIA', 9),
          ('EQ', 'EQUITIES', 'DEV', 'DEVELOPED MARKETS', 1),
          ('EQ', 'EQUITIES', 'DMF', 'DEVELOPED MARKETS FACTOR', 2),
          ('EQ', 'EQUITIES', 'DMS', 'DEVELOPED MARKETS SMALL CAP', 3),
          ('EQ', 'EQUITIES', 'EME', 'EMERGING MARKETS', 4),
          ('EQ', 'EQUITIES', 'ACX', 'AC WORLD', 5),
          ('EQ', 'EQUITIES', 'EUR', 'EUROPE', 6),
          ('EQ', 'EQUITIES', 'JAP', 'JAPAN', 7),
          ('EQ', 'EQUITIES', 'AEJ', 'ASIA EX-JAPAN', 8),
          ('EQ', 'EQUITIES', 'UNI', 'UNITED STATES', 9),
          ('EQ', 'EQUITIES', 'NOR', 'NORTH AMERICA', 10),
          ('EQ', 'EQUITIES', 'DUU', 'DUURZAAM', 11),
          ('EQ', 'EQUITIES', 'MIL', 'MILIEU & WATER', 12),
          ('EQ', 'EQUITIES', 'BIO', 'BIODIVERSITY', 13),
          ('EQ', 'EQUITIES', 'FUN', 'FUNDS', 14),
          ('EQ', 'EQUITIES', 'EMF', 'EMERGING MARKETS FACTOR', 15),
          ('EQ', 'EQUITIES', 'AWF', 'AC WORLD FACTOR', 16),
          ('FI', 'FIXED_INCOME', 'ABS', 'ASSET BACKED SECURITIES', 1),
          ('FI', 'FIXED_INCOME', 'BAN', 'BANKLOANS', 2),
          ('FI', 'FIXED_INCOME', 'BIO', 'BIODIVERSITY', 3),
          ('FI', 'FIXED_INCOME', 'CON', 'CONVERTABLES', 4),
          ('FI', 'FIXED_INCOME', 'CCL', 'CLO (COLLATERALIZED LOAN OBLIGATION)', 5),
          ('FI', 'FIXED_INCOME', 'COR', 'CORPORATES EUROPE', 6),
          ('FI', 'FIXED_INCOME', 'CRE', 'CREDITS EUROPE', 7),
          ('FI', 'FIXED_INCOME', 'CRG', 'CREDITS GLOBAL', 8),
          ('FI', 'FIXED_INCOME', 'CRU', 'CREDITS USA', 9),
          ('FI', 'FIXED_INCOME', 'DHM', 'DEBT HY MICRO FINANCIERING', 10),
          ('FI', 'FIXED_INCOME', 'DIE', 'DEBT IG ECA LOANS', 11),
          ('FI', 'FIXED_INCOME', 'DIW', 'DEBT IG WSW LOANS', 12),
          ('FI', 'FIXED_INCOME', 'DUU', 'DUURZAAM', 13),
          ('FI', 'FIXED_INCOME', 'EMB', 'EMERGING MARKETS BLEND', 14),
          ('FI', 'FIXED_INCOME', 'EMH', 'EMERGING MARKETS HC', 15),
          ('FI', 'FIXED_INCOME', 'EML', 'EMERGING MARKETS LC', 16),
          ('FI', 'FIXED_INCOME', 'FUN', 'FUNDS', 17),
          ('FI', 'FIXED_INCOME', 'GRE', 'GREENBONDS', 18),
          ('FI', 'FIXED_INCOME', 'HYE', 'HIGH YIELD EUROPE', 19),
          ('FI', 'FIXED_INCOME', 'HYG', 'HIGH YIELD GLOBAL', 20),
          ('FI', 'FIXED_INCOME', 'HYU', 'HIGH YIELD USA', 21),
          ('FI', 'FIXED_INCOME', 'ILB', 'INFLATION LINKED BONDS EUROPE', 22),
          ('FI', 'FIXED_INCOME', 'INL', 'INFLATION LINKED BONDS GLOBAL', 23),
          ('FI', 'FIXED_INCOME', 'LDI', 'LDI', 24),
          ('FI', 'FIXED_INCOME', 'LIM', 'LIQUID INVESTMENTS (MONEY MARKET)', 25),
          ('FI', 'FIXED_INCOME', 'LIQ', 'LIQUIDITIES', 26),
          ('FI', 'FIXED_INCOME', 'MOR', 'MORTGAGES', 27),
          ('FI', 'FIXED_INCOME', 'OVE', 'OVERLAYFUNDS', 28),
          ('FI', 'FIXED_INCOME', 'PRI', 'PRIVATE LOANS', 29),
          ('FI', 'FIXED_INCOME', 'SEC', 'SECURITIZED', 30),
          ('FI', 'FIXED_INCOME', 'SOC', 'SOCIAL', 31),
          ('FI', 'FIXED_INCOME', 'SOV', 'SOVEREIGN EUROPE', 32),
          ('FI', 'FIXED_INCOME', 'SOG', 'SOVEREIGN GLOBAL', 33),
          ('FI', 'FIXED_INCOME', 'COG', 'CORPORATES GLOBAL', 34),
          ('FI', 'FIXED_INCOME', 'COU', 'CORPORATES USA', 35),
          ('FI', 'FIXED_INCOME', 'CBE', 'COVERED BONDS EUROPE', 36),
          ('FI', 'FIXED_INCOME', 'CBG', 'COVERED BONDS GLOBAL', 37),
          ('FI', 'FIXED_INCOME', 'CBU', 'COVERED BONDS USA', 38),
          ('FI', 'FIXED_INCOME', 'DHD', 'DEBT HY DIRECT LOANS', 39),
          ('FI', 'FIXED_INCOME', 'DHI', 'DEBT HY INFRASTRUCTURE', 40),
          ('FI', 'FIXED_INCOME', 'DIO', 'DEBT IG OVERIG', 41),
          ('FI', 'FIXED_INCOME', 'DIP', 'DEBT IG PRIVATE PLACEMENTS', 42),
          ('FI', 'FIXED_INCOME', 'SSB', 'SOVEREIGN SHORT BONDS', 43),
          ('FI', 'FIXED_INCOME', 'SOU', 'SOVEREIGN USA', 44),
          ('FI', 'FIXED_INCOME', 'SSE', 'SSA EUROPE (SOVEREIGN, SUPRANATIONAL, AGENCY)', 45),
          ('FI', 'FIXED_INCOME', 'SSG', 'SSA GLOBAL  (SOVEREIGN, SUPRANATIONAL, AGENCY)', 46),
          ('FI', 'FIXED_INCOME', 'SGB', 'SSA GREEN BONDS EUR  (SOVEREIGN, SUPRANATIONAL, AGENCY)', 47),
          ('FI', 'FIXED_INCOME', 'SSU', 'SSA USA', 48),
          ('RA', 'REAL_ASSETS', 'AGR', 'AGRICULTURE', 1),
          ('RA', 'REAL_ASSETS', 'COM', 'COMMODITIES', 2),
          ('RA', 'REAL_ASSETS', 'INF', 'INFRASTRUCTURE', 3),
          ('RA', 'REAL_ASSETS', 'REA', 'REALESTATE LISTED', 4),
          ('RA', 'REAL_ASSETS', 'RED', 'REALESTATE DIRECT', 5),
          ('RA', 'REAL_ASSETS', 'RNL', 'REALESTATE NON-LISTED NETHERLANDS', 6),
          ('RA', 'REAL_ASSETS', 'REN', 'REALESTATE NON-LISTED INTERNATIONAL', 7),
          ('RA', 'REAL_ASSETS', 'RNA', 'REALESTATE NON-LISTED EUROPE', 8),
          ('RA', 'REAL_ASSETS', 'RNB', 'REALESTATE NON-LISTED ASIA PACIFIC', 9),
          ('RA', 'REAL_ASSETS', 'RNC', 'REALESTATE NON-LISTED NORTH AMERICA', 10),
          ('RA', 'REAL_ASSETS', 'FOR', 'FORESTRY', 11),
          ('MA', 'MULTI_ASSETS', 'DEF', 'DEFENSIVE', 1),
          ('MA', 'MULTI_ASSETS', 'VER', 'VERY DEFENSIVE', 2),
          ('MA', 'MULTI_ASSETS', 'NEU', 'NEUTRAL', 3),
          ('MA', 'MULTI_ASSETS', 'OFF', 'OFFENSIVE', 4),
          ('MA', 'MULTI_ASSETS', 'VEO', 'VERY OFFENSIVE', 5),
          ('MA', 'MULTI_ASSETS', 'MIX', 'MIX', 6),
          ('OV', 'OVERLAY', 'INT', 'INTEREST', 1),
          ('OV', 'OVERLAY', 'CUR', 'CURRENCY', 2),
          ('OV', 'OVERLAY', 'INF', 'INFLATION', 3),
          ('OV', 'OVERLAY', 'EQU', 'EQUITY', 4),
          ('OV', 'OVERLAY', 'FUN', 'FUNDS', 5),
          ('IM', 'IMPACT', 'IMP', 'IMPACT', 1),
          ('IM', 'IMPACT', 'EQU', 'EQUITIES', 2),
          ('IM', 'IMPACT', 'FID', 'FIXED INCOME DEBT', 3),
          ('IM', 'IMPACT', 'PRI', 'PRIVATE EQUITY', 4),
          ('IM', 'IMPACT', 'REA', 'REALESTATE', 5),
          ('IM', 'IMPACT', 'AGR', 'AGRICULTURE', 6),
          ('IM', 'IMPACT', 'INF', 'INFRASTRUCTURE', 7),
          ('IM', 'IMPACT', 'CLI', 'CLIMATE', 8),
          ('IM', 'IMPACT', 'FOR', 'FORESTRY', 9),
          ('OP', 'OPBOUW', NULL, NULL, NULL),
          ('RD', 'RENDEMENT', NULL, NULL, NULL),
          ('RT', 'RENTE', NULL, NULL, NULL),
          ('IF', 'INFLATION', NULL, NULL, NULL),
          ('MT', 'MATCHING', NULL, NULL, NULL),
          ('CL', 'COLLATERAL', NULL, NULL, NULL),
          ('RV', 'RESERVE', NULL, NULL, NULL)
        ),
        ins_asset AS (
          INSERT INTO ${CC_SCHEMA}.asset_class (asset_class_code, asset_class_name)
          SELECT DISTINCT asset_code, asset_name FROM source
          ON CONFLICT (asset_class_code) DO UPDATE SET asset_class_name = EXCLUDED.asset_class_name
          RETURNING 1
        )
        INSERT INTO ${CC_SCHEMA}.sub_asset_class (asset_class_id, sub_asset_class_code, sub_asset_class_name, sort_order)
        SELECT a.asset_class_id, s.sub_code, s.sub_name, s.sort_order
        FROM source s
        JOIN ${CC_SCHEMA}.asset_class a ON a.asset_class_code = s.asset_code
        WHERE s.sub_code IS NOT NULL
        ON CONFLICT (asset_class_id, sub_asset_class_code) DO UPDATE SET
          sub_asset_class_name = EXCLUDED.sub_asset_class_name,
          sort_order = EXCLUDED.sort_order
      `);
      console.log("[migrate] Client-config asset class hierarchy seeded.");
    } catch (err) {
      console.warn(`[migrate] CC asset seed: ${err instanceof Error ? err.message : err}`);
    }

    // 7d. Create validation trigger on client_config.account
    try {
      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION ${CC_SCHEMA}.validate_account_selection() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE expected text;
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM ${CC_SCHEMA}.sub_asset_class s
            WHERE s.sub_asset_class_id = NEW.sub_asset_class_id
              AND s.asset_class_id = NEW.asset_class_id
          ) THEN
            RAISE EXCEPTION 'Sub asset class hoort niet bij asset class';
          END IF;
          SELECT NEW.client_code || '*' || a.asset_class_code || s.sub_asset_class_code || '*' || m.manager_code
          INTO expected
          FROM ${CC_SCHEMA}.asset_class a,
               ${CC_SCHEMA}.sub_asset_class s, ${CC_SCHEMA}.manager m
          WHERE a.asset_class_id = NEW.asset_class_id
            AND s.sub_asset_class_id = NEW.sub_asset_class_id
            AND m.manager_id = NEW.manager_id;
          IF NEW.primary_account_id <> expected THEN
            RAISE EXCEPTION 'primary_account_id % moet % zijn', NEW.primary_account_id, expected;
          END IF;
          RETURN NEW;
        END $$;
      `);
      await sql.unsafe(`
        DROP TRIGGER IF EXISTS trg_validate_account_selection ON ${CC_SCHEMA}.account
      `);
      await sql.unsafe(`
        CREATE TRIGGER trg_validate_account_selection
          BEFORE INSERT OR UPDATE ON ${CC_SCHEMA}.account
          FOR EACH ROW EXECUTE FUNCTION ${CC_SCHEMA}.validate_account_selection()
      `);
      console.log("[migrate] Client-config account validation trigger created.");
    } catch (err) {
      console.warn(`[migrate] CC trigger: ${err instanceof Error ? err.message : err}`);
    }

    // 7f. Create client_config.npc_classification, portfolio_configuration,
    //     and change_portfolio_configuration — the tables used by the seed
    //     endpoint and the admin client-config page.
    const CC_EXTRA_TABLES = [
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.npc_classification (
        npc_classification_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        classification_name varchar(80) NOT NULL UNIQUE CHECK (classification_name ~ '^.{1,80}$')
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.portfolio_configuration (
        primary_account_id varchar(13) PRIMARY KEY CHECK (primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$'),
        client_code varchar(3) NOT NULL REFERENCES ${CC_SCHEMA}.client(client_code),
        portfolio_code varchar(15) NOT NULL REFERENCES ${CC_SCHEMA}.portfolio(portfolio_code),
        asset_class_code char(2) NOT NULL REFERENCES ${CC_SCHEMA}.asset_class(asset_class_code),
        sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
        manager_code char(3) NOT NULL REFERENCES ${CC_SCHEMA}.manager(manager_code),
        benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> ''),
        npc_classification_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.npc_classification(npc_classification_id),
        long_name varchar(255) NOT NULL,
        short_name varchar(100) NOT NULL,
        active_ind boolean NOT NULL DEFAULT true,
        effective_from date NOT NULL,
        effective_until date,
        change_request_id uuid UNIQUE REFERENCES change_requests(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_pc_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
      )`,
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.change_portfolio_configuration (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        action_type varchar(10) NOT NULL CHECK (action_type IN ('CREATE','UPDATE','DELETE')),
        target_primary_account_id varchar(13) CHECK (target_primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$'),
        client_code varchar(3) NOT NULL REFERENCES ${CC_SCHEMA}.client(client_code),
        portfolio_code varchar(15) NOT NULL REFERENCES ${CC_SCHEMA}.portfolio(portfolio_code),
        asset_class_code char(2) NOT NULL REFERENCES ${CC_SCHEMA}.asset_class(asset_class_code),
        sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
        manager_code char(3) NOT NULL REFERENCES ${CC_SCHEMA}.manager(manager_code),
        benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> ''),
        npc_classification_id smallint NOT NULL REFERENCES ${CC_SCHEMA}.npc_classification(npc_classification_id),
        long_name varchar(255) NOT NULL,
        short_name varchar(100) NOT NULL,
        active_ind boolean NOT NULL DEFAULT true,
        effective_from date NOT NULL,
        effective_until date,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      // Staging table for user-requestable lookup additions (new asset class,
      // new sub asset class, new benchmark). Values here do NOT need to exist
      // in the live lookup tables yet — they are introduced by the change
      // process itself (stage → approve → apply).
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.change_lookup_request (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        dimension varchar(20) NOT NULL CHECK (dimension IN ('asset_class','sub_asset_class','benchmark')),
        asset_class_code char(2),
        asset_class_name varchar(30),
        parent_asset_class_code char(2),
        sub_asset_class_code char(3),
        sub_asset_class_name varchar(100),
        benchmark_code varchar(60),
        benchmark_name varchar(100),
        currency varchar(3),
        sort_order integer,
        apply_status varchar(20) NOT NULL DEFAULT 'pending' CHECK (apply_status IN ('pending','applied','failed')),
        apply_error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      // Onboarding staging table for genuinely new pension funds. Holds the
      // new client identity (client_code/client_name) plus the initial
      // portfolio metadata until the customer_onboarding change request
      // reaches 'processed'. Like change_lookup_request, the values here do
      // NOT need to exist in the live client_config tables yet — they are
      // introduced by the apply step (stage → approve → apply).
      //
      // Idempotency: UNIQUE (client_code, status) allows at most one row per
      // client code per status, so a re-processed change finds the existing
      // 'applied' row and is skipped, and duplicate 'pending' onboarding
      // requests for the same client code are rejected at the database level.
      `CREATE TABLE IF NOT EXISTS ${CC_SCHEMA}.client_onboarding_staging (
        staging_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        change_request_id uuid NOT NULL UNIQUE REFERENCES change_requests(id) ON DELETE CASCADE,
        client_code varchar(3) NOT NULL CHECK (client_code ~ '^[A-Z0-9]{1,3}$'),
        client_name varchar(100) NOT NULL CHECK (client_name ~ '^[^\\r\\n]{1,100}$'),
        portfolio_code varchar(15) NOT NULL CHECK (portfolio_code ~ '^[A-Z0-9]{2,15}$'),
        parent_account_code varchar(16) CHECK (parent_account_code IS NULL OR parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
        asset_class_code char(2) NOT NULL CHECK (asset_class_code ~ '^[A-Z]{2}$'),
        sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
        manager_code char(3) NOT NULL CHECK (manager_code ~ '^[A-Z0-9]{3}$'),
        benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> ''),
        npc_classification_id smallint NOT NULL,
        long_name varchar(255) NOT NULL CHECK (long_name ~ '^[^\\r\\n]{1,255}$'),
        short_name varchar(100) NOT NULL CHECK (short_name ~ '^[^\\r\\n]{1,100}$'),
        effective_from date NOT NULL,
        effective_until date,
        status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','failed')),
        apply_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        CONSTRAINT chk_onboarding_dates CHECK (effective_until IS NULL OR effective_until >= effective_from),
        CONSTRAINT uq_onboarding_client_status UNIQUE (client_code, status)
      )`,
    ];

    let ccExtraTableCount = 0;
    let ccExtraTableFailed = 0;
    for (const ddl of CC_EXTRA_TABLES) {
      try {
        await sql.unsafe(ddl);
        ccExtraTableCount++;
      } catch (err) {
        ccExtraTableFailed++;
        console.error(`[migrate] CC extra table: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[migrate] Client-config extra tables: ${ccExtraTableCount} created/verified, ${ccExtraTableFailed} failed.`);

    // 7f.1. Backfill client_code for existing client_config rows. Existing
    // rows used portfolio_code as the account-id prefix, so the first three
    // characters are the best available client short code.
    try {
      await sql.unsafe(`
        INSERT INTO ${CC_SCHEMA}.client (client_code, client_name)
        SELECT DISTINCT left(portfolio_code, 3), left(portfolio_code, 3)
        FROM ${CC_SCHEMA}.portfolio
        WHERE portfolio_code IS NOT NULL
        ON CONFLICT (client_code) DO NOTHING
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.account
        ADD COLUMN IF NOT EXISTS client_code varchar(3) REFERENCES ${CC_SCHEMA}.client(client_code)
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.portfolio_configuration
        ADD COLUMN IF NOT EXISTS client_code varchar(3) REFERENCES ${CC_SCHEMA}.client(client_code)
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.change_portfolio_configuration
        ADD COLUMN IF NOT EXISTS client_code varchar(3) REFERENCES ${CC_SCHEMA}.client(client_code)
      `);
      await sql.unsafe(`
        UPDATE ${CC_SCHEMA}.portfolio_configuration
        SET client_code = left(portfolio_code, 3)
        WHERE client_code IS NULL
      `);
      await sql.unsafe(`
        UPDATE ${CC_SCHEMA}.change_portfolio_configuration
        SET client_code = left(portfolio_code, 3)
        WHERE client_code IS NULL
      `);
      await sql.unsafe(`
        UPDATE ${CC_SCHEMA}.account a
        SET client_code = left(p.portfolio_code, 3)
        FROM ${CC_SCHEMA}.portfolio p
        WHERE a.portfolio_id = p.portfolio_id
          AND a.client_code IS NULL
      `);
      console.log("[migrate] Client-config client_code columns created/backfilled.");
    } catch (err) {
      console.warn(`[migrate] client_code backfill: ${err instanceof Error ? err.message : err}`);
    }

    // 7f.2. Convert existing portfolio-derived account identifiers to the new
    // client-derived format. Duplicate client/asset/sub-asset/manager tuples
    // will fail here, which is useful because the new model requires them to
    // be unique before the shorter primary key can be enforced.
    try {
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.portfolio_configuration
        DROP CONSTRAINT IF EXISTS portfolio_configuration_primary_account_id_check
      `);
      await sql.unsafe(`
        UPDATE ${CC_SCHEMA}.portfolio_configuration
        SET primary_account_id = client_code || '*' || asset_class_code || sub_asset_class_code || '*' || manager_code
        WHERE client_code IS NOT NULL
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.portfolio_configuration
        ALTER COLUMN primary_account_id TYPE varchar(13)
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.portfolio_configuration
        ALTER COLUMN client_code SET NOT NULL
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.portfolio_configuration
        ADD CONSTRAINT portfolio_configuration_primary_account_id_check
        CHECK (primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$')
      `);

      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.account
        DROP CONSTRAINT IF EXISTS account_primary_account_id_check
      `);
      await sql.unsafe(`
        UPDATE ${CC_SCHEMA}.account acc
        SET primary_account_id = acc.client_code || '*' || ac.asset_class_code || sac.sub_asset_class_code || '*' || mgr.manager_code
        FROM ${CC_SCHEMA}.asset_class ac,
             ${CC_SCHEMA}.sub_asset_class sac,
             ${CC_SCHEMA}.manager mgr
        WHERE acc.client_code IS NOT NULL
          AND ac.asset_class_id = acc.asset_class_id
          AND sac.sub_asset_class_id = acc.sub_asset_class_id
          AND mgr.manager_id = acc.manager_id
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.account
        ALTER COLUMN primary_account_id TYPE varchar(13)
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.account
        ALTER COLUMN client_code SET NOT NULL
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.account
        ADD CONSTRAINT account_primary_account_id_check
        CHECK (primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$')
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.change_portfolio_configuration
        ALTER COLUMN client_code SET NOT NULL
      `);
      console.log("[migrate] Client-config primary_account_id values converted to client-code format.");
    } catch (err) {
      console.warn(`[migrate] primary_account_id conversion: ${err instanceof Error ? err.message : err}`);
    }

    // 7f.3. Add target_primary_account_id to change_portfolio_configuration.
    // Stores the original primary_account_id of the live row an UPDATE/DELETE
    // change targets, so the apply step can find the correct row even when
    // the change modifies fields (asset_class_code, sub_asset_class_code,
    // manager_code) that derive primary_account_id. NULL for CREATE rows.
    // Idempotent: ADD COLUMN IF NOT EXISTS + constraint drop/re-add + backfill.
    try {
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.change_portfolio_configuration
        ADD COLUMN IF NOT EXISTS target_primary_account_id varchar(13)
      `);
      // Backfill existing staged UPDATE/DELETE rows: the current staged
      // dimension values are the best available target for rows staged
      // before this column existed (the apply step derives the key from
      // the staged dimensions, so this preserves existing behaviour).
      await sql.unsafe(`
        UPDATE ${CC_SCHEMA}.change_portfolio_configuration
        SET target_primary_account_id =
            client_code || '*' || asset_class_code || sub_asset_class_code || '*' || manager_code
        WHERE target_primary_account_id IS NULL
          AND action_type IN ('UPDATE','DELETE')
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.change_portfolio_configuration
        DROP CONSTRAINT IF EXISTS change_portfolio_configuration_target_primary_account_id_check
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.change_portfolio_configuration
        ADD CONSTRAINT change_portfolio_configuration_target_primary_account_id_check
        CHECK (target_primary_account_id IS NULL OR target_primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$')
      `);
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_cpc_target_primary_account_id
        ON ${CC_SCHEMA}.change_portfolio_configuration(target_primary_account_id)
      `);
      console.log("[migrate] change_portfolio_configuration.target_primary_account_id column added/verified.");
    } catch (err) {
      console.warn(`[migrate] target_primary_account_id migration: ${err instanceof Error ? err.message : err}`);
    }

    // 7f.4. Add active_ind to staged portfolio-configuration changes so the
    // governed workflow can update the full business row, including active
    // state, without direct table writes.
    try {
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.change_portfolio_configuration
        ADD COLUMN IF NOT EXISTS active_ind boolean NOT NULL DEFAULT true
      `);
      console.log("[migrate] change_portfolio_configuration.active_ind column added/verified.");
    } catch (err) {
      console.warn(`[migrate] change_portfolio_configuration.active_ind migration: ${err instanceof Error ? err.message : err}`);
    }

    // 7g. Fix existing check constraints that may have been created with
    //     incorrect backslash escaping (migration bug). Drop the constraint
    //     and re-create it with a simpler pattern.
    try {
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.npc_classification
        DROP CONSTRAINT IF EXISTS npc_classification_classification_name_check
      `);
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.npc_classification
        ADD CONSTRAINT npc_classification_classification_name_check
        CHECK (classification_name ~ '^.{1,80}$')
      `);
      console.log("[migrate] Fixed npc_classification check constraint.");
    } catch (err) {
      console.warn(`[migrate] npc_classification check constraint fix: ${err instanceof Error ? err.message : err}`);
    }

    // 7h. Fix existing portfolio_configuration check constraints that may have
    //     been created with incorrect backslash escaping.
    try {
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.portfolio_configuration
        DROP CONSTRAINT IF EXISTS portfolio_configuration_long_name_check
      `);
      console.log("[migrate] Dropped portfolio_configuration long_name check.");
    } catch (err) {
      console.warn(`[migrate] portfolio_configuration long_name check drop: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        ALTER TABLE ${CC_SCHEMA}.portfolio_configuration
        DROP CONSTRAINT IF EXISTS portfolio_configuration_short_name_check
      `);
      console.log("[migrate] Dropped portfolio_configuration short_name check.");
    } catch (err) {
      console.warn(`[migrate] portfolio_configuration short_name check drop: ${err instanceof Error ? err.message : err}`);
    }

    // 7i. Create indexes for portfolio_configuration
    const CC_EXTRA_INDEXES = [
      `CREATE INDEX IF NOT EXISTS idx_pc_client_code ON ${CC_SCHEMA}.portfolio_configuration(client_code)`,
      `CREATE INDEX IF NOT EXISTS idx_pc_portfolio_code ON ${CC_SCHEMA}.portfolio_configuration(portfolio_code)`,
      `CREATE INDEX IF NOT EXISTS idx_pc_benchmark_code ON ${CC_SCHEMA}.portfolio_configuration(benchmark_code)`,
      `CREATE INDEX IF NOT EXISTS idx_pc_npc_classification_id ON ${CC_SCHEMA}.portfolio_configuration(npc_classification_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pc_active_ind ON ${CC_SCHEMA}.portfolio_configuration(active_ind)`,
      `CREATE INDEX IF NOT EXISTS idx_cpc_change_request_id ON ${CC_SCHEMA}.change_portfolio_configuration(change_request_id)`,
    ];
    for (const ddl of CC_EXTRA_INDEXES) {
      try { await sql.unsafe(ddl); } catch (err) {
        console.warn(`[migrate] CC extra index: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[migrate] Client-config extra indexes created/verified.`);

    // 7h. Seed client_config once on first start of an empty database. The
    //     same script is used by admin reset and manual CLI seeding.
    try {
      const configCount = await sql.unsafe(`SELECT COUNT(*) AS cnt FROM ${CC_SCHEMA}.portfolio_configuration`);
      if (Number(configCount[0]?.cnt ?? 0) === 0) {
        console.log("[migrate] Seeding client_config default data…");
        const summary = await seedClientConfig(sql, { silent: true });
        console.log(`[migrate] Client-config seed complete: ${summary.configurations} configurations, ${summary.managers} managers, ${summary.benchmarks} benchmarks.`);
      }
    } catch (err) {
      console.warn(`[migrate] CC default data seed: ${err instanceof Error ? err.message : err}`);
    }

    // 6. Seed demo data if tables are empty (safe to re-run — uses ON CONFLICT DO NOTHING)
    //    This ensures fresh deployments always have test data without relying on init.sql
    //    (which only runs on first PostgreSQL volume creation).
    try {
      const count = await sql`SELECT COUNT(*) AS cnt FROM clients`;
      if (Number(count[0]?.cnt ?? 0) === 0) {
        console.log("[migrate] Seeding demo data…");
        const benchmarks = [
          ["9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1", "MSCI-WORLD-NR", "MSCI World Net Return", "Aandelen", "EUR", 1000.00, "MSCI"],
          ["b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d", "MSCI-ACWI-NR", "MSCI ACWI Net Return", "Aandelen", "EUR", 1200.00, "MSCI"],
          ["7c8bd971-b05c-4141-9a27-7ee0d02137a5", "BLOOMBERG-EU-AGG", "Bloomberg Euro Aggregate", "Obligaties", "EUR", 1000.00, "Bloomberg"],
          ["9644a84d-59d6-40fa-aee9-062fbc1ef9fc", "ICE-BOFA-EU-CORP", "ICE BofA Euro Corporate", "Obligaties", "EUR", 1000.00, "ICE BofA"],
          ["a1b2c3d4-e5f6-7890-abcd-ef0123456780", "CUSTOM-ESG-NL", "Duurzame NL Benchmark", "Aandelen", "EUR", 1500.00, "rimes"],
          ["a1b2c3d4-e5f6-7890-abcd-ef0123456781", "RIMES-PRIVATE-EQ", "Rimes Private Equity Index", "Alternatieven", "EUR", 2000.00, "rimes"],
          ["a1b2c3d4-e5f6-7890-abcd-ef0123456782", "EURO-GOVT-1-3Y", "Euro Government 1-3 Year", "Obligaties", "EUR", 800.00, "Bloomberg"],
          ["a1b2c3d4-e5f6-7890-abcd-ef0123456783", "GLOBAL-REIT-NR", "Global REIT Net Return", "Vastgoed", "EUR", 1500.00, "MSCI"],
          ["9a1b2c3d-4e5f-6789-abcd-ef0123456784", "MSCI-EM-NR", "MSCI Emerging Markets Net Return", "Aandelen", "USD", 1000.00, "MSCI"],
          ["9a1b2c3d-4e5f-6789-abcd-ef0123456785", "BLOOMBERG-GL-AGG", "Bloomberg Global Aggregate", "Obligaties", "USD", 1000.00, "Bloomberg"],
          ["9a1b2c3d-4e5f-6789-abcd-ef0123456786", "HFRX-GL-HEDGE", "HFRX Global Hedge Fund Index", "Alternatieven", "USD", 2500.00, "HFRX"],
          ["9a1b2c3d-4e5f-6789-abcd-ef0123456787", "S&P-500-NR", "S&P 500 Net Return", "Aandelen", "USD", 1000.00, "S&P"],
        ];
        const clients = [
          ["9f9280fc-9572-49d1-b81c-2a039652bc93", "Pensioenfonds Horizon", "PF-HOR-001"],
          ["7b9303c1-3a0d-4398-a5c2-740ea76dfe37", "Stichting Pensioen Zeker", "PF-ZEK-002"],
        ];
        const portfolios = [
          ["c4707067-b98a-4a0f-92c7-5ee510dc70ff", clients[0][0], "Rendementsportefeuille", "HOR-RP", benchmarks[0][0],
            "00000001-0000-4000-a000-000000000001", "00000002-0000-4000-a000-000000000001", "00000003-0000-4000-a000-000000000001", "00000004-0000-4000-a000-000000000001"],
          ["c12ca209-4df0-4774-bf96-0e31b5a10ff4", clients[0][0], "Matchingportefeuille", "HOR-MP", benchmarks[2][0],
            "00000001-0000-4000-a000-000000000002", "00000002-0000-4000-a000-000000000002", "00000003-0000-4000-a000-000000000001", "00000004-0000-4000-a000-000000000002"],
          ["93de32a3-f238-4504-9fad-ab97cbe1a174", clients[1][0], "Return portefeuille", "ZEK-RET", benchmarks[1][0],
            "00000001-0000-4000-a000-000000000001", "00000002-0000-4000-a000-000000000001", "00000003-0000-4000-a000-000000000002", "00000004-0000-4000-a000-000000000001"],
        ];
        // Seed portfolio attribute lookup tables
        const wtpData = [
          ["00000001-0000-4000-a000-000000000001", "Rendement"],
          ["00000001-0000-4000-a000-000000000002", "Matching"],
          ["00000001-0000-4000-a000-000000000003", "Opbouw"],
          ["00000001-0000-4000-a000-000000000004", "CVP"],
          ["00000001-0000-4000-a000-000000000005", "Rente"],
          ["00000001-0000-4000-a000-000000000006", "Reserve"],
        ];
        const assetClassData = [
          ["00000002-0000-4000-a000-000000000001", "EQUITIES", "Aandelen"],
          ["00000002-0000-4000-a000-000000000002", "FIXED_INCOME", "Obligaties"],
          ["00000002-0000-4000-a000-000000000003", "REAL_ESTATE", "Vastgoed"],
          ["00000002-0000-4000-a000-000000000004", "ALTERNATIVES", "Alternatieven"],
          ["00000002-0000-4000-a000-000000000005", "CASH", "Liquiditeiten"],
          ["00000002-0000-4000-a000-000000000006", "PRIVATE_EQUITY", "Private Equity"],
          ["00000002-0000-4000-a000-000000000007", "INFRASTRUCTURE", "Infrastructuur"],
          ["00000002-0000-4000-a000-000000000008", "COMMODITIES", "Grondstoffen"],
        ];
        const managerData = [
          ["00000003-0000-4000-a000-000000000001", "EIGEN BEHEER"],
          ["00000003-0000-4000-a000-000000000002", "ABERDEEN"],
          ["00000003-0000-4000-a000-000000000003", "ACADIAN"],
          ["00000003-0000-4000-a000-000000000004", "ADVENT"],
          ["00000003-0000-4000-a000-000000000005", "AEGON"],
          ["00000003-0000-4000-a000-000000000006", "ALLIANCE BERNSTEIN"],
          ["00000003-0000-4000-a000-000000000007", "ALLSPRING"],
          ["00000003-0000-4000-a000-000000000008", "ALMAZARA"],
          ["00000003-0000-4000-a000-000000000009", "AQR"],
          ["00000003-0000-4000-a000-000000000010", "ARROWSTREET"],
          ["00000003-0000-4000-a000-000000000011", "AXA"],
          ["00000003-0000-4000-a000-000000000012", "BARCLAYS"],
          ["00000003-0000-4000-a000-000000000013", "BARINGS"],
          ["00000003-0000-4000-a000-000000000014", "BLACKROCK"],
          ["00000003-0000-4000-a000-000000000015", "BLUEBAY"],
          ["00000003-0000-4000-a000-000000000016", "BNP PARIBAS"],
          ["00000003-0000-4000-a000-000000000017", "BSM"],
          ["00000003-0000-4000-a000-000000000018", "CARDANO"],
          ["00000003-0000-4000-a000-000000000019", "CITIBANK"],
          ["00000003-0000-4000-a000-000000000020", "CTI"],
          ["00000003-0000-4000-a000-000000000021", "DDJ"],
          ["00000003-0000-4000-a000-000000000022", "DE MUNT HYPOTHEKEN"],
          ["00000003-0000-4000-a000-000000000023", "DEUTSCHE"],
          ["00000003-0000-4000-a000-000000000024", "DYNAMIC CREDIT"],
          ["00000003-0000-4000-a000-000000000025", "FIDELITY"],
          ["00000003-0000-4000-a000-000000000026", "GOLDMAN SACHS"],
          ["00000003-0000-4000-a000-000000000027", "HENDERSON"],
          ["00000003-0000-4000-a000-000000000028", "ING"],
          ["00000003-0000-4000-a000-000000000029", "INSIGHT"],
          ["00000003-0000-4000-a000-000000000030", "INTERMEDE"],
          ["00000003-0000-4000-a000-000000000031", "IRISH LIFE"],
          ["00000003-0000-4000-a000-000000000032", "JP MORGAN"],
          ["00000003-0000-4000-a000-000000000033", "KEMPEN"],
          ["00000003-0000-4000-a000-000000000034", "KOPERNIK"],
          ["00000003-0000-4000-a000-000000000035", "LAZARD"],
          ["00000003-0000-4000-a000-000000000036", "LEGAL & GENERAL"],
          ["00000003-0000-4000-a000-000000000037", "LSV"],
          ["00000003-0000-4000-a000-000000000038", "M&G"],
          ["00000003-0000-4000-a000-000000000039", "METLIFE"],
          ["00000003-0000-4000-a000-000000000040", "MFS"],
          ["00000003-0000-4000-a000-000000000041", "MORGAN STANLEY"],
          ["00000003-0000-4000-a000-000000000042", "NINETY ONE"],
          ["00000003-0000-4000-a000-000000000043", "NOMURA"],
          ["00000003-0000-4000-a000-000000000044", "NORDEA"],
          ["00000003-0000-4000-a000-000000000045", "NORTHERN TRUST"],
          ["00000003-0000-4000-a000-000000000046", "OAKTREE"],
          ["00000003-0000-4000-a000-000000000047", "PAYDEN RYGEL"],
          ["00000003-0000-4000-a000-000000000048", "PGIM"],
          ["00000003-0000-4000-a000-000000000049", "PIMCO"],
          ["00000003-0000-4000-a000-000000000050", "PINESTONE"],
          ["00000003-0000-4000-a000-000000000051", "PVF HYPOTHEKEN"],
          ["00000003-0000-4000-a000-000000000052", "PZENA"],
          ["00000003-0000-4000-a000-000000000053", "ROBECO"],
          ["00000003-0000-4000-a000-000000000054", "RUSSELL"],
          ["00000003-0000-4000-a000-000000000055", "SIXTH STREET"],
          ["00000003-0000-4000-a000-000000000056", "STATESTREET"],
          ["00000003-0000-4000-a000-000000000057", "STONE HARBOUR"],
          ["00000003-0000-4000-a000-000000000058", "T-ROWE"],
          ["00000003-0000-4000-a000-000000000059", "UBS"],
        ];
        const benchmarkData = [
          ["00000004-0000-4000-a000-000000000001", "Benchmark A"],
          ["00000004-0000-4000-a000-000000000002", "Benchmark B"],
          ["00000004-0000-4000-a000-000000000003", "Benchmark C"],
        ];
        for (const [id, code, name, assetClass, currency, cost, provider] of benchmarks) {
          await sql`INSERT INTO benchmark_catalog (id, code, name, asset_class, currency, cost, provider) VALUES (${id}, ${code}, ${name}, ${assetClass}, ${currency}, ${cost}, ${provider}) ON CONFLICT (id) DO NOTHING`;
        }
        for (const [id, name, reference] of clients) {
          await sql`INSERT INTO clients (id, name, external_reference) VALUES (${id}, ${name}, ${reference}) ON CONFLICT (id) DO NOTHING`;
        }
        for (const [id, name] of wtpData) {
          await sql`INSERT INTO wtp_classifications (id, name) VALUES (${id}, ${name}) ON CONFLICT (id) DO NOTHING`;
        }
        for (const [id, clientId, name, reference, benchmarkId, wtpId, acId, mgrId, bgId] of portfolios) {
          void mgrId;
          void bgId;
          await sql`INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id,
            wtp_classification_id, asset_class_id)
            VALUES (${id}, ${clientId}, ${name}, ${reference}, ${benchmarkId},
              ${wtpId}, ${acId}) ON CONFLICT (id) DO NOTHING`;
        }
        console.log("[migrate] Demo data seeded successfully.");
      } else {
        console.log("[migrate] Database already has data — skipping seed.");
      }

      // Seed default change type configs if the table is empty
      try {
        const typeCount = await sql`SELECT COUNT(*) AS cnt FROM change_type_config`;
        if (Number(typeCount[0]?.cnt ?? 0) === 0) {
          console.log("[migrate] Seeding default change types…");
          // Insert benchmark_switch type
          await sql`
            INSERT INTO change_type_config (id, slug, name, description, category, fields, ist_soll_mapping, cost, default_lead_days, stakeholders, workflow, active, sort_order)
            VALUES (
              '00000000-0000-0000-0000-000000000001', 'benchmark_switch', 'Benchmarkwissel',
              'Wijzig de benchmark van een of meerdere portefeuilles.', 'benchmark',
              '[{"key":"portfolio_id","label":"Portefeuille","type":"select","required":true,"referenceTable":"portfolios"},{"key":"current_benchmark_id","label":"Huidige benchmark (IST)","type":"benchmark","required":true,"referenceTable":"benchmark_catalog"},{"key":"requested_benchmark_id","label":"Gewenste benchmark (SOLL)","type":"benchmark","required":true,"referenceTable":"benchmark_catalog"}]'::jsonb,
              '[{"ist":"current_benchmark_id","soll":"requested_benchmark_id","labelIst":"Huidige benchmark","labelSoll":"Gewenste benchmark"}]'::jsonb,
              '{"baseCost":0,"costCurrency":"EUR","perItemCost":500,"description":"€ 500 per portefeuille (administratiekosten)"}'::jsonb,
              7,
              '[{"id":"internal_admin","name":"Eigen administratie","role":"Administratie","notifyOn":["on_submit","on_approval"],"mandatory":true,"contactType":"webhook"},{"id":"asset_service_provider","name":"Asset service provider","role":"Portefeuilleadministratie","notifyOn":["on_approval"],"mandatory":true,"contactType":"webhook"},{"id":"factset","name":"FactSet","role":"Performancemeting","notifyOn":["on_completion"],"mandatory":false,"contactType":"webhook"}]'::jsonb,
              'benchmark_switch', true, 10
            ) ON CONFLICT (slug) DO NOTHING
          `;
          // Insert new_benchmark type
          await sql`
            INSERT INTO change_type_config (id, slug, name, description, category, fields, ist_soll_mapping, cost, default_lead_days, stakeholders, workflow, active, sort_order)
            VALUES (
              '00000000-0000-0000-0000-000000000002', 'new_benchmark', 'Nieuwe benchmark',
              'Vraag een nieuwe benchmark aan die nog niet in de catalogus staat.', 'benchmark',
              '[{"key":"short_name","label":"Short name","type":"text","required":true,"maxLength":20,"helpText":"Verkorte code, bijvoorbeeld MSCI-WRLD-NL"},{"key":"long_name","label":"Long name","type":"text","required":true,"maxLength":200},{"key":"asset_class","label":"Asset class","type":"select","required":true,"options":[{"value":"Aandelen","label":"Aandelen"},{"value":"Obligaties","label":"Obligaties"},{"value":"Vastgoed","label":"Vastgoed"},{"value":"Alternatieven","label":"Alternatieven"},{"value":"Liquiditeiten","label":"Liquiditeiten"},{"value":"Private Equity","label":"Private Equity"},{"value":"Infrastructure","label":"Infrastructure"},{"value":"Grondstoffen","label":"Grondstoffen"}]},{"key":"currency","label":"Valuta","type":"select","required":true,"defaultValue":"EUR","options":[{"value":"EUR","label":"EUR"},{"value":"USD","label":"USD"},{"value":"GBP","label":"GBP"}]}]'::jsonb,
              '[]'::jsonb,
              '{"baseCost":5000,"costCurrency":"EUR","description":"€ 5.000 eenmalige onderzoekskosten"}'::jsonb,
              28,
              '[{"id":"research","name":"Research team","role":"Benchmarkonderzoek","notifyOn":["on_submit"],"mandatory":true,"contactType":"email"},{"id":"internal_admin","name":"Eigen administratie","role":"Administratie","notifyOn":["on_approval"],"mandatory":true,"contactType":"webhook"}]'::jsonb,
              'new_benchmark', true, 20
            ) ON CONFLICT (slug) DO NOTHING
          `;
          // Insert fee_change type (third type — proves generic model extensibility)
          await sql`
            INSERT INTO change_type_config (id, slug, name, description, category, fields, ist_soll_mapping, cost, default_lead_days, stakeholders, workflow, active, sort_order)
            VALUES (
              '00000000-0000-0000-0000-000000000003', 'fee_change', 'Tariefwijziging',
              'Wijzig de beheervergoeding voor een of meerdere portefeuilles.', 'fee',
              '[{"key":"portfolio_id","label":"Portefeuille","type":"select","required":true,"referenceTable":"portfolios"},{"key":"current_fee","label":"Huidig tarief (IST)","type":"number","required":true,"min":0,"max":5,"helpText":"Huidig beheertarief in procenten"},{"key":"requested_fee","label":"Gewenst tarief (SOLL)","type":"number","required":true,"min":0,"max":5,"helpText":"Gewenst beheertarief in procenten"},{"key":"effective_date","label":"Ingangsdatum nieuw tarief","type":"date","required":true}]'::jsonb,
              '[{"ist":"current_fee","soll":"requested_fee","labelIst":"Huidig tarief","labelSoll":"Gewenst tarief"}]'::jsonb,
              '{"baseCost":250,"costCurrency":"EUR","description":"€ 250 administratiekosten"}'::jsonb,
              14,
              '[{"id":"internal_admin","name":"Eigen administratie","role":"Administratie","notifyOn":["on_submit","on_approval"],"mandatory":true,"contactType":"webhook"},{"id":"asset_service_provider","name":"Asset service provider","role":"Portefeuilleadministratie","notifyOn":["on_approval"],"mandatory":true,"contactType":"webhook"}]'::jsonb,
              'fee_change', true, 30
            ) ON CONFLICT (slug) DO NOTHING
          `;
          console.log("[migrate] Default change types (3 types) seeded.");
        }
        await sql`
          UPDATE change_type_config
          SET active = false, updated_at = now()
          WHERE slug <> 'benchmark_switch'
            AND active = true
        `;
      } catch (err) {
        console.warn(
          `[migrate] Could not seed change types: ${
            err instanceof Error ? err.message : err
          }`
        );
      }

      // Seed lookup tables with initial values if empty
      const lookupSeeds = [
        `INSERT INTO wtp_classifications (id, name) VALUES
          ('00000001-0000-4000-a000-000000000001', 'Rendement'),
          ('00000001-0000-4000-a000-000000000002', 'Matching'),
          ('00000001-0000-4000-a000-000000000003', 'Opbouw'),
          ('00000001-0000-4000-a000-000000000004', 'CVP'),
          ('00000001-0000-4000-a000-000000000005', 'Rente'),
          ('00000001-0000-4000-a000-000000000006', 'Reserve')
         ON CONFLICT (id) DO NOTHING`,
      ];
      for (const ddl of lookupSeeds) {
        try { await sql.unsafe(ddl); } catch (err) {
          console.warn(`[migrate] Lookup seed: ${err instanceof Error ? err.message : err}`);
        }
      }

    } catch (err) {
      // Seeding is non-fatal — tables already exist
      console.warn(
        `[migrate] Could not seed demo data: ${
          err instanceof Error ? err.message : err
        }`
      );
    }

    // Legacy public managers/benchmarks were replaced by client_config.manager
    // and client_config.benchmark.

    // 16. Add apply outcome tracking columns to change_portfolio_configuration.
    //     When a change request is processed, the status and error message from
    //     applyChangePortfolioConfigurations() are stored on each staged row so
    //     they can be displayed on the change detail page.
    try {
      await sql.unsafe(`
        ALTER TABLE client_config.change_portfolio_configuration
        ADD COLUMN IF NOT EXISTS apply_status varchar(10)
          DEFAULT NULL
          CHECK (apply_status IS NULL OR apply_status IN ('applied','skipped','failed'))
      `);
      console.log("[migrate] Added apply_status column to change_portfolio_configuration.");
    } catch (err) {
      console.warn(`[migrate] apply_status column: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        ALTER TABLE client_config.change_portfolio_configuration
        ADD COLUMN IF NOT EXISTS apply_error text DEFAULT NULL
      `);
      console.log("[migrate] Added apply_error column to change_portfolio_configuration.");
    } catch (err) {
      console.warn(`[migrate] apply_error column: ${err instanceof Error ? err.message : err}`);
    }

    // 17. Add active_ind columns to parent_account and portfolio, and create
    //     the change_portfolio_metadata_request staging table.
    //     See portfolio-parent-account-lifecycle-spec.md for the full spec.
    try {
      await sql.unsafe(`
        ALTER TABLE client_config.parent_account
        ADD COLUMN IF NOT EXISTS active_ind boolean NOT NULL DEFAULT true
      `);
      console.log("[migrate] Added active_ind to parent_account.");
    } catch (err) {
      console.warn(`[migrate] active_ind parent_account: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        ALTER TABLE client_config.portfolio
        ADD COLUMN IF NOT EXISTS active_ind boolean NOT NULL DEFAULT true
      `);
      console.log("[migrate] Added active_ind to portfolio.");
    } catch (err) {
      console.warn(`[migrate] active_ind portfolio: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_parent_account_active_ind
        ON client_config.parent_account(active_ind)
      `);
      console.log("[migrate] Created parent_account active_ind index.");
    } catch (err) {
      console.warn(`[migrate] parent_account index: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_portfolio_active_ind
        ON client_config.portfolio(active_ind)
      `);
      console.log("[migrate] Created portfolio active_ind index.");
    } catch (err) {
      console.warn(`[migrate] portfolio index: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS client_config.change_portfolio_metadata_request (
          id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          change_request_id    uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
          dimension            varchar(20) NOT NULL CHECK (dimension IN ('portfolio', 'parent_account')),
          action_type          varchar(10) NOT NULL CHECK (action_type IN ('CREATE', 'RETIRE')),
          code                 varchar(16) NOT NULL,
          parent_account_code  varchar(16),
          msa_parent_account_code varchar(16),
          apply_status         varchar(10) NOT NULL DEFAULT 'pending'
                               CHECK (apply_status IN ('pending', 'applied', 'failed')),
          apply_error          text,
          created_at           timestamptz NOT NULL DEFAULT now()
        )
      `);
      console.log("[migrate] Created change_portfolio_metadata_request table.");
    } catch (err) {
      console.warn(`[migrate] change_portfolio_metadata_request: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_cpmp_change_request_id
        ON client_config.change_portfolio_metadata_request(change_request_id)
      `);
      console.log("[migrate] Created change_portfolio_metadata_request index.");
    } catch (err) {
      console.warn(`[migrate] cpmp index: ${err instanceof Error ? err.message : err}`);
    }

    // 18. Admin audit log for out-of-band admin bypass mutations on
    //     client_config.portfolio / parent_account.
    //     The governed change-request flow is audited via audit_log +
    //     status_history + the staged change_portfolio_metadata_request rows
    //     (apply lineage, spec §6.6). Admin direct CRUD has no change request,
    //     so every mutation is recorded here instead (lifecycle spec §9.2:
    //     "the admin action must be recorded out-of-band").
    //     Written by the admin helper functions in lib/client-config-db.ts.
    try {
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS client_config.admin_audit_log (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          action text NOT NULL,
          dimension text NOT NULL,
          code text NOT NULL,
          actor text NOT NULL DEFAULT 'admin',
          details jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      console.log("[migrate] Created client_config.admin_audit_log table.");
    } catch (err) {
      console.warn(`[migrate] admin_audit_log: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_admin_audit_log_dim_code
        ON client_config.admin_audit_log (dimension, code)
      `);
      console.log("[migrate] Created admin_audit_log dim+code index.");
    } catch (err) {
      console.warn(`[migrate] admin_audit_log index: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
        ON client_config.admin_audit_log (created_at)
      `);
      console.log("[migrate] Created admin_audit_log created index.");
    } catch (err) {
      console.warn(`[migrate] admin_audit_log created index: ${err instanceof Error ? err.message : err}`);
    }

    // The asset-class hierarchy is now maintained only in client_config.
    // Remove the retired public lookup tables after all transition logic has run.
    try {
      const cleanupStatements = [
        `ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS portfolios_asset_class_id_fkey`,
        `ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS portfolios_sub_asset_class_id_fkey`,
        `ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_asset_class_id_fkey`,
        `ALTER TABLE benchmark_catalog DROP CONSTRAINT IF EXISTS benchmark_catalog_asset_class_id_fkey`,
        `ALTER TABLE new_benchmark_requests DROP CONSTRAINT IF EXISTS new_benchmark_requests_asset_class_id_fkey`,
        `DROP INDEX IF EXISTS idx_sub_ac_asset_class_id`,
        `DROP INDEX IF EXISTS idx_asset_classes_code`,
        `DROP TABLE IF EXISTS sub_asset_classes CASCADE`,
        `DROP TABLE IF EXISTS asset_classes CASCADE`,
      ];
      for (const statement of cleanupStatements) {
        await sql.unsafe(statement);
      }
      console.log("[migrate] Removed retired public asset class lookup tables.");
    } catch (err) {
      console.warn(
        `[migrate] Legacy asset lookup cleanup: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  } finally {
    await sql.end();
  }
}

// Run migration; throw on failure so startup.mjs can catch it
// (process.exit would kill the process before startup.mjs can log the error)
try {
  await main();
} catch (err) {
  console.error("[migrate] Fatal error:", err instanceof Error ? err.message : err);
  throw err;
}
