import postgres from "postgres";
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";
import type { Benchmark, ChangeRequest, ClientConfig } from "@/lib/types";

const connectionString = process.env.DATABASE_URL;
const sql = connectionString ? postgres(connectionString, { max: 5, idle_timeout: 20 }) : null;

function mapBenchmark(row: Record<string, unknown>): Benchmark {
  return { id: String(row.id), code: String(row.code), name: String(row.name), assetClass: String(row.asset_class), currency: String(row.currency) };
}

export async function getBenchmarks(): Promise<Benchmark[]> {
  if (!sql) return benchmarks;
  try {
    const rows = await sql`SELECT id, code, name, asset_class, currency FROM benchmark_catalog WHERE active = true ORDER BY asset_class, name`;
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

export async function saveChangeRequest(input: {
  id: string; reference: string; clientId: string; requestedBy: string; rationale: string; effectiveDate: string;
  items: Array<{ id: string; portfolioId: string; previousBenchmarkId: string; requestedBenchmarkId: string }>;
}) {
  if (!sql) throw new Error("Database niet bereikbaar. Start eerst de PostgreSQL-service.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (transaction: any) => {
    await transaction`INSERT INTO change_requests (id, reference, change_type, client_id, requested_by, rationale, effective_date, status) VALUES (${input.id}, ${input.reference}, 'benchmark_switch', ${input.clientId}, ${input.requestedBy}, ${input.rationale}, ${input.effectiveDate}, 'submitted')`;
    for (const item of input.items) {
      await transaction`INSERT INTO change_request_items (id, change_request_id, portfolio_id, previous_benchmark_id, requested_benchmark_id) VALUES (${item.id}, ${input.id}, ${item.portfolioId}, ${item.previousBenchmarkId}, ${item.requestedBenchmarkId})`;
    }
  });
}

export async function getChangeRequest(id: string): Promise<ChangeRequest | null> {
  if (!sql) return null;
  const header = await sql`
    SELECT cr.id, cr.reference, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at, c.name AS client_name, c.external_reference AS client_reference
    FROM change_requests cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ${id}`;
  if (header.length === 0) return null;
  const items = await sql`
    SELECT p.name AS portfolio_name, p.external_reference AS portfolio_reference,
      previous.id AS previous_id, previous.code AS previous_code, previous.name AS previous_name, previous.asset_class AS previous_asset_class, previous.currency AS previous_currency,
      requested.id AS requested_id, requested.code AS requested_code, requested.name AS requested_name, requested.asset_class AS requested_asset_class, requested.currency AS requested_currency
    FROM change_request_items item
    JOIN portfolios p ON p.id = item.portfolio_id
    JOIN benchmark_catalog previous ON previous.id = item.previous_benchmark_id
    JOIN benchmark_catalog requested ON requested.id = item.requested_benchmark_id
    WHERE item.change_request_id = ${id} ORDER BY p.name`;
  const row = header[0];
  return {
    id: String(row.id), reference: String(row.reference), clientName: String(row.client_name), clientReference: String(row.client_reference), requestedBy: String(row.requested_by), rationale: String(row.rationale), effectiveDate: String(row.effective_date), status: String(row.status), createdAt: String(row.created_at),
    items: items.map((item) => ({
      portfolioName: String(item.portfolio_name), portfolioReference: String(item.portfolio_reference),
      previousBenchmark: { id: String(item.previous_id), code: String(item.previous_code), name: String(item.previous_name), assetClass: String(item.previous_asset_class), currency: String(item.previous_currency) },
      requestedBenchmark: { id: String(item.requested_id), code: String(item.requested_code), name: String(item.requested_name), assetClass: String(item.requested_asset_class), currency: String(item.requested_currency) },
    })),
  };
}
