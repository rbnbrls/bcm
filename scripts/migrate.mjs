import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const REQUIRED_TABLES = [
  "clients",
  "benchmark_catalog",
  "portfolios",
  "change_requests",
  "change_request_items",
  "new_benchmark_requests",
  "audit_log",
  "approvals",
  "change_type_config",
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
        active boolean NOT NULL DEFAULT true
      )`,
      `CREATE TABLE IF NOT EXISTS portfolios (
        id uuid PRIMARY KEY,
        client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name text NOT NULL,
        external_reference text NOT NULL,
        current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
        currency text NOT NULL DEFAULT 'EUR',
        active boolean NOT NULL DEFAULT true,
        UNIQUE (client_id, external_reference)
      )`,
      `CREATE TABLE IF NOT EXISTS change_requests (
        id uuid PRIMARY KEY,
        reference text NOT NULL UNIQUE,
        change_type text NOT NULL,
        client_id uuid NOT NULL REFERENCES clients(id),
        requested_by text NOT NULL,
        rationale text NOT NULL,
        effective_date date NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now()
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
      `CREATE TABLE IF NOT EXISTS change_type_config (
        id uuid PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        category text NOT NULL DEFAULT 'general',
        fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        ist_soll_mapping jsonb,
        cost jsonb NOT NULL DEFAULT '{}'::jsonb,
        default_lead_days integer NOT NULL DEFAULT 5,
        stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
        workflow text NOT NULL DEFAULT 'default',
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
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

    // 4. Seed demo data if tables are empty (safe to re-run — uses ON CONFLICT DO NOTHING)
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
          ["c4707067-b98a-4a0f-92c7-5ee510dc70ff", clients[0][0], "Rendementsportefeuille", "HOR-RP", benchmarks[0][0]],
          ["c12ca209-4df0-4774-bf96-0e31b5a10ff4", clients[0][0], "Matchingportefeuille", "HOR-MP", benchmarks[2][0]],
          ["93de32a3-f238-4504-9fad-ab97cbe1a174", clients[1][0], "Return portefeuille", "ZEK-RET", benchmarks[1][0]],
        ];
        for (const [id, code, name, assetClass, currency, cost, provider] of benchmarks) {
          await sql`INSERT INTO benchmark_catalog (id, code, name, asset_class, currency, cost, provider) VALUES (${id}, ${code}, ${name}, ${assetClass}, ${currency}, ${cost}, ${provider}) ON CONFLICT (id) DO NOTHING`;
        }
        for (const [id, name, reference] of clients) {
          await sql`INSERT INTO clients (id, name, external_reference) VALUES (${id}, ${name}, ${reference}) ON CONFLICT (id) DO NOTHING`;
        }
        for (const [id, clientId, name, reference, benchmarkId] of portfolios) {
          await sql`INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id) VALUES (${id}, ${clientId}, ${name}, ${reference}, ${benchmarkId}) ON CONFLICT (id) DO NOTHING`;
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
          console.log("[migrate] Default change types seeded.");
        }
      } catch (err) {
        console.warn(
          `[migrate] Could not seed change types: ${
            err instanceof Error ? err.message : err
          }`
        );
      }

      // Apply generic change-type model column migrations
      const migrateColumns = [
        `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS change_type_id uuid REFERENCES change_type_config(id)`,
        `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '[]'::jsonb`,
        `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb`,
        `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost numeric(10,2)`,
        `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost_currency text NOT NULL DEFAULT 'EUR'`,
        `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_lead_days integer`,
      ];
      for (const ddl of migrateColumns) {
        try { await sql.unsafe(ddl); } catch { /* column may already exist */ }
      }
    } catch (err) {
      // Seeding is non-fatal — tables already exist
      console.warn(
        `[migrate] Could not seed demo data: ${
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
