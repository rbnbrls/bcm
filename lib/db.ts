import postgres from "postgres";
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";
import type { Benchmark, ChangeRequest, ClientConfig } from "@/lib/types";

const connectionString = process.env.DATABASE_URL;
const sql = connectionString ? postgres(connectionString, { max: 5, idle_timeout: 20 }) : null;

function mapBenchmark(row: Record<string, unknown>): Benchmark {
  return {
    id: String(row.id), code: String(row.code), name: String(row.name),
    assetClass: String(row.asset_class), currency: String(row.currency),
    cost: typeof row.cost === 'number' ? row.cost : Number(row.cost ?? 1000),
    provider: String(row.provider ?? 'rimes'),
  };
}

export async function getBenchmarks(): Promise<Benchmark[]> {
  if (!sql) return benchmarks;
  try {
    const rows = await sql`SELECT id, code, name, asset_class, currency, cost, provider FROM benchmark_catalog WHERE active = true ORDER BY asset_class, name`;
    return rows.map(mapBenchmark);
  } catch {
    return benchmarks;
  }
}

export async function getClientConfigs(): Promise<ClientConfig[]> {
  if (!sql) return demoClientConfigs;
  try {
    const rows = await sql`
      SELECT c.id AS client_id, c.name AS client_name, c.external_reference AS client_reference,
        p.id AS portfolio_id, p.name AS portfolio_name, p.external_reference AS portfolio_reference,
        b.id, b.code, b.name, b.asset_class, b.currency
      FROM clients c
      LEFT JOIN portfolios p ON p.client_id = c.id AND p.active = true
      LEFT JOIN benchmark_catalog b ON b.id = p.current_benchmark_id
      WHERE c.status = 'active'
      ORDER BY c.name, p.name`;
    const byClient = new Map<string, ClientConfig>();
    for (const row of rows) {
      const clientId = String(row.client_id);
      const client = byClient.get(clientId) ?? { id: clientId, name: String(row.client_name), externalReference: String(row.client_reference), portfolios: [] };
      if (row.portfolio_id) {
        client.portfolios.push({
          id: String(row.portfolio_id), name: String(row.portfolio_name), externalReference: String(row.portfolio_reference),
          currentBenchmarkId: String(row.id), currentBenchmark: mapBenchmark(row),
        });
      }
      byClient.set(clientId, client);
    }
    return [...byClient.values()];
  } catch {
    return demoClientConfigs;
  }
}

async function ensureTables(transaction: any): Promise<void> {
  try {
    await transaction`SELECT 1 FROM change_requests LIMIT 0`;
  } catch {
    console.log("[db] change_requests table missing — creating on demand…");
    await transaction.unsafe(`
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
      )
    `);
    await transaction.unsafe(`
      CREATE TABLE IF NOT EXISTS change_request_items (
        id uuid PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        portfolio_id uuid NOT NULL REFERENCES portfolios(id),
        previous_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
        requested_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
        UNIQUE(change_request_id, portfolio_id)
      )
    `);
    console.log("[db] change_requests tables created on demand.");
  }
}

export async function ensureNewBenchmarkRequestsTable(transaction: any): Promise<void> {
  try {
    await transaction`SELECT 1 FROM new_benchmark_requests LIMIT 0`;
  } catch {
    console.log("[db] new_benchmark_requests table missing — creating on demand…");
    await transaction.unsafe(`
      CREATE TABLE IF NOT EXISTS new_benchmark_requests (
        id uuid PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        short_name text NOT NULL,
        long_name text NOT NULL,
        asset_class text NOT NULL,
        currency text NOT NULL DEFAULT 'EUR',
        estimated_cost numeric(10,2) NOT NULL DEFAULT 5000.00,
        estimated_lead_weeks integer NOT NULL DEFAULT 4
      )
    `);
    console.log("[db] new_benchmark_requests table created on demand.");
  }
}

export async function insertBenchmark(benchmark: { id: string; code: string; name: string; assetClass: string; currency: string }): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  await sql`
    INSERT INTO benchmark_catalog (id, code, name, asset_class, currency)
    VALUES (${benchmark.id}, ${benchmark.code}, ${benchmark.name}, ${benchmark.assetClass}, ${benchmark.currency})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function saveChangeRequest(input: {
  id: string; reference: string; changeType: string; clientId: string; requestedBy: string; rationale: string; effectiveDate: string;
  items: Array<{ id: string; portfolioId: string; previousBenchmarkId: string; requestedBenchmarkId: string }>;
}) {
  if (!sql) throw new Error("Database niet bereikbaar. Start eerst de PostgreSQL-service.");
  await (sql as any).begin(async (transaction: any) => {
    await ensureTables(transaction);
    await transaction`INSERT INTO change_requests (id, reference, change_type, client_id, requested_by, rationale, effective_date, status) VALUES (${input.id}, ${input.reference}, ${input.changeType}, ${input.clientId}, ${input.requestedBy}, ${input.rationale}, ${input.effectiveDate}, 'submitted')`;
    for (const item of input.items) {
      await transaction`INSERT INTO change_request_items (id, change_request_id, portfolio_id, previous_benchmark_id, requested_benchmark_id) VALUES (${item.id}, ${input.id}, ${item.portfolioId}, ${item.previousBenchmarkId}, ${item.requestedBenchmarkId})`;
    }
  });
}

export async function saveNewBenchmarkRequest(input: {
  id: string;
  changeRequestId: string;
  shortName: string;
  longName: string;
  assetClass: string;
  currency: string;
}) {
  if (!sql) throw new Error("Database niet bereikbaar. Start eerst de PostgreSQL-service.");
  await (sql as any).begin(async (transaction: any) => {
    await ensureNewBenchmarkRequestsTable(transaction);
    await transaction`
      INSERT INTO new_benchmark_requests (id, change_request_id, short_name, long_name, asset_class, currency)
      VALUES (${input.id}, ${input.changeRequestId}, ${input.shortName}, ${input.longName}, ${input.assetClass}, ${input.currency})
    `;
  });
}

export async function getChangeRequest(id: string): Promise<ChangeRequest | null> {
  if (!sql) return null;
  const header = await sql`
    SELECT cr.id, cr.reference, cr.change_type, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at, c.name AS client_name, c.external_reference AS client_reference
    FROM change_requests cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ${id}`;
  if (header.length === 0) return null;
  const row = header[0];

  let newBenchmarkData = undefined;
  if (String(row.change_type) === 'new_benchmark') {
    const nbRows = await sql`
      SELECT id, short_name, long_name, asset_class, currency, estimated_cost, estimated_lead_weeks
      FROM new_benchmark_requests WHERE change_request_id = ${id} LIMIT 1
    `;
    if (nbRows.length > 0) {
      newBenchmarkData = {
        id: String(nbRows[0].id),
        shortName: String(nbRows[0].short_name),
        longName: String(nbRows[0].long_name),
        assetClass: String(nbRows[0].asset_class),
        currency: String(nbRows[0].currency),
        estimatedCost: Number(nbRows[0].estimated_cost),
        estimatedLeadWeeks: Number(nbRows[0].estimated_lead_weeks),
      };
    }
  }

  const items = await sql`
    SELECT p.name AS portfolio_name, p.external_reference AS portfolio_reference,
      previous.id AS previous_id, previous.code AS previous_code, previous.name AS previous_name, previous.asset_class AS previous_asset_class, previous.currency AS previous_currency, previous.cost AS previous_cost, previous.provider AS previous_provider,
      requested.id AS requested_id, requested.code AS requested_code, requested.name AS requested_name, requested.asset_class AS requested_asset_class, requested.currency AS requested_currency, requested.cost AS requested_cost, requested.provider AS requested_provider
    FROM change_request_items item
    JOIN portfolios p ON p.id = item.portfolio_id
    JOIN benchmark_catalog previous ON previous.id = item.previous_benchmark_id
    JOIN benchmark_catalog requested ON requested.id = item.requested_benchmark_id
    WHERE item.change_request_id = ${id} ORDER BY p.name`;

  return {
    id: String(row.id), reference: String(row.reference), changeType: String(row.change_type), clientName: String(row.client_name), clientReference: String(row.client_reference), requestedBy: String(row.requested_by), rationale: String(row.rationale), effectiveDate: String(row.effective_date), status: String(row.status), createdAt: String(row.created_at),
    items: items.map((item) => ({
      portfolioName: String(item.portfolio_name), portfolioReference: String(item.portfolio_reference),
      previousBenchmark: { id: String(item.previous_id), code: String(item.previous_code), name: String(item.previous_name), assetClass: String(item.previous_asset_class), currency: String(item.previous_currency), cost: Number(item.previous_cost ?? 1000), provider: String(item.previous_provider ?? 'rimes') },
      requestedBenchmark: { id: String(item.requested_id), code: String(item.requested_code), name: String(item.requested_name), assetClass: String(item.requested_asset_class), currency: String(item.requested_currency), cost: Number(item.requested_cost ?? 1000), provider: String(item.requested_provider ?? 'rimes') },
    })),
    newBenchmark: newBenchmarkData,
  };
}
