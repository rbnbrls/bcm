import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const sql = postgres(connectionString, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id uuid PRIMARY KEY,
      name text NOT NULL UNIQUE,
      external_reference text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS benchmark_catalog (
      id uuid PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      asset_class text NOT NULL,
      currency text NOT NULL,
      active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE IF NOT EXISTS portfolios (
      id uuid PRIMARY KEY,
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name text NOT NULL,
      external_reference text NOT NULL,
      current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
      currency text NOT NULL DEFAULT 'EUR',
      active boolean NOT NULL DEFAULT true,
      UNIQUE (client_id, external_reference)
    );
    CREATE TABLE IF NOT EXISTS change_requests (
      id uuid PRIMARY KEY,
      reference text NOT NULL UNIQUE,
      change_type text NOT NULL,
      client_id uuid NOT NULL REFERENCES clients(id),
      requested_by text NOT NULL,
      rationale text NOT NULL,
      effective_date date NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS change_request_items (
      id uuid PRIMARY KEY,
      change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
      portfolio_id uuid NOT NULL REFERENCES portfolios(id),
      previous_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
      requested_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
      UNIQUE(change_request_id, portfolio_id)
    );
  `;
  console.log("Database schema is ready.");
} finally {
  await sql.end();
}
