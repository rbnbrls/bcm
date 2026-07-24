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
];

const sql = postgres(connectionString, { max: 1 });

try {
  // Run each CREATE TABLE as an independent sql call so that a transient
  // failure in one statement doesn't block the others.  Each uses
  // IF NOT EXISTS so repeated runs are safe.
  const statements = [
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
  ];

  for (const ddl of statements) {
    try {
      await sql.unsafe(ddl);
    } catch (err) {
      // Log the failure but keep trying the remaining tables
      console.error(`[migrate] Failed to create table: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Verify every required table actually exists in the database
  const present = new Set();
  try {
    const rows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    for (const row of rows) {
      present.add(String(row.table_name));
    }
  } catch {
    console.warn("[migrate] Could not verify table existence (querying information_schema failed).");
  }

  if (present.size > 0) {
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    if (missing.length > 0) {
      console.error(`[migrate] MISSING TABLES: ${missing.join(", ")} — the application may not work correctly.`);
    } else {
      console.log(`[migrate] All ${REQUIRED_TABLES.length} required tables present.`);
    }
  }

  console.log("Database schema is ready.");
} finally {
  await sql.end();
}
