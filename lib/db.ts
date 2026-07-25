import postgres from "postgres";
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";
import type { Benchmark, ChangeRequest, ChangeRequestSummary, ClientConfig, ChangeStatus } from "@/lib/types";
import { CHANGE_STATUS_LABELS } from "@/lib/types";

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
  for (const attempt of [1, 2]) {
    try {
      const rows = await sql`SELECT id, code, name, asset_class, currency, cost, provider FROM benchmark_catalog WHERE active = true OR active IS NULL ORDER BY asset_class, name`;
      return rows.map(mapBenchmark);
    } catch {
      if (attempt === 1) {
        try {
          await ensureReadTables(sql);
        } catch {
          // ensureReadTables itself failed — nothing more we can do
        }
      }
    }
  }
  // DB is available but query failed even after repair — don't return fixture
  // data that doesn't exist in the database, as it would cause FK violations
  // downstream when saveChangeRequest tries to insert fixture benchmark IDs
  // that don't exist in benchmark_catalog.
  return [];
}

export async function getClientConfigs(): Promise<ClientConfig[]> {
  if (!sql) return demoClientConfigs;
  for (const attempt of [1, 2]) {
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
      if (attempt === 1) {
        try {
          await ensureReadTables(sql);
        } catch {
          // ensureReadTables failed — nothing more we can do
        }
      }
    }
  }
  // DB is available but query failed even after repair — return empty
  // instead of fixture data to prevent downstream FK violations.
  return [];
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
        sla_lead_weeks integer NOT NULL DEFAULT 1,
        status_updated_at timestamptz NOT NULL DEFAULT now(),
        processed_at date,
        processed_by text,
        validated_at date,
        validated_by text,
        notification_sent boolean NOT NULL DEFAULT false,
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
  slaLeadWeeks?: number;
}) {
  if (!sql) throw new Error("Database niet bereikbaar. Start eerst de PostgreSQL-service.");
  await (sql as any).begin(async (transaction: any) => {
    await ensureTables(transaction);
    const sla = input.slaLeadWeeks ?? (input.changeType === "new_benchmark" ? 4 : 1);
    // Check if new columns exist; if not, use the old schema
    let hasNewColumns = false;
    try {
      await transaction`SELECT sla_lead_weeks FROM change_requests LIMIT 0`;
      hasNewColumns = true;
    } catch {
      hasNewColumns = false;
    }

    if (hasNewColumns) {
      await transaction`
        INSERT INTO change_requests (id, reference, change_type, client_id, requested_by, rationale, effective_date, status, sla_lead_weeks, status_updated_at)
        VALUES (${input.id}, ${input.reference}, ${input.changeType}, ${input.clientId}, ${input.requestedBy}, ${input.rationale}, ${input.effectiveDate}, 'submitted', ${sla}, now())
      `;
    } else {
      await transaction`
        INSERT INTO change_requests (id, reference, change_type, client_id, requested_by, rationale, effective_date, status)
        VALUES (${input.id}, ${input.reference}, ${input.changeType}, ${input.clientId}, ${input.requestedBy}, ${input.rationale}, ${input.effectiveDate}, 'submitted')
      `;
    }
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

async function ensureReadTables(sqlClient: any): Promise<void> {
  const REQUIRED_TABLES = ["clients", "benchmark_catalog", "portfolios", "change_requests", "change_request_items", "new_benchmark_requests"];
  const DDL_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS clients (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, external_reference text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS benchmark_catalog (id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, asset_class text NOT NULL, currency text NOT NULL, cost numeric(10,2) NOT NULL DEFAULT 1000.00, provider text NOT NULL DEFAULT 'rimes', active boolean NOT NULL DEFAULT true)`,
    `CREATE TABLE IF NOT EXISTS portfolios (id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE, name text NOT NULL, external_reference text NOT NULL, current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id), currency text NOT NULL DEFAULT 'EUR', active boolean NOT NULL DEFAULT true, UNIQUE (client_id, external_reference))`,
    `CREATE TABLE IF NOT EXISTS change_requests (id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, change_type text NOT NULL, client_id uuid NOT NULL REFERENCES clients(id), requested_by text NOT NULL, rationale text NOT NULL, effective_date date NOT NULL, status text NOT NULL DEFAULT 'draft', sla_lead_weeks integer NOT NULL DEFAULT 1, status_updated_at timestamptz NOT NULL DEFAULT now(), processed_at date, processed_by text, validated_at date, validated_by text, notification_sent boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS change_request_items (id uuid PRIMARY KEY, change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE, portfolio_id uuid NOT NULL REFERENCES portfolios(id), previous_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id), requested_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id), UNIQUE(change_request_id, portfolio_id))`,
    `CREATE TABLE IF NOT EXISTS new_benchmark_requests (id uuid PRIMARY KEY, change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE, short_name text NOT NULL, long_name text NOT NULL, asset_class text NOT NULL, currency text NOT NULL DEFAULT 'EUR', estimated_cost numeric(10,2) NOT NULL DEFAULT 5000.00, estimated_lead_weeks integer NOT NULL DEFAULT 4)`,
  ];
  const present = new Set<string>();
  try {
    const rows = await sqlClient`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    for (const row of rows) present.add(String(row.table_name));
  } catch {
    // information_schema may not be accessible — create all tables anyway
  }
  for (const ddl of DDL_STATEMENTS) {
    const match = ddl.match(/CREATE TABLE IF NOT EXISTS (?:public\.)?(\w+)/);
    const tname = match ? match[1] : "";
    if (tname && present.has(tname)) continue;
    try { await sqlClient.unsafe(ddl); } catch { /* table may already exist */ }
  }

  // Schema evolution: add columns that were introduced after the initial schema
  const schemaMigrations = [
    `ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`,
    `ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS cost numeric(10,2) NOT NULL DEFAULT 1000.00`,
    `ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'rimes'`,
    `ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS lead_weeks integer NOT NULL DEFAULT 1`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_lead_weeks integer NOT NULL DEFAULT 1`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now()`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS processed_at date`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS processed_by text`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS validated_at date`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS validated_by text`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS notification_sent boolean NOT NULL DEFAULT false`,
  ];
  for (const ddl of schemaMigrations) {
    try { await sqlClient.unsafe(ddl); } catch { /* column may already exist */ }
  }
}

export async function getChangeRequest(id: string): Promise<ChangeRequest | null> {
  if (!sql) return null;

  let header: any[];
  try {
    header = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at, cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by, cr.notification_sent, c.id AS client_id, c.name AS client_name, c.external_reference AS client_reference
      FROM change_requests cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ${id}`;
  } catch {
    // Tables may not exist yet — create them on demand and retry
    try {
      await ensureReadTables(sql);
      header = await sql`
        SELECT cr.id, cr.reference, cr.change_type, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at, cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by, cr.notification_sent, c.id AS client_id, c.name AS client_name, c.external_reference AS client_reference
        FROM change_requests cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ${id}`;
    } catch {
      return null;
    }
  }
  if (header.length === 0) return null;
  const row = header[0];

  let newBenchmarkData = undefined;
  if (String(row.change_type) === 'new_benchmark') {
    try {
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
    } catch {
      // new_benchmark_requests table may not exist — ignore
    }
  }

  let items: any[] = [];
  try {
    items = await sql`
      SELECT p.name AS portfolio_name, p.external_reference AS portfolio_reference,
        previous.id AS previous_id, previous.code AS previous_code, previous.name AS previous_name, previous.asset_class AS previous_asset_class, previous.currency AS previous_currency, previous.cost AS previous_cost, previous.provider AS previous_provider,
        requested.id AS requested_id, requested.code AS requested_code, requested.name AS requested_name, requested.asset_class AS requested_asset_class, requested.currency AS requested_currency, requested.cost AS requested_cost, requested.provider AS requested_provider
      FROM change_request_items item
      JOIN portfolios p ON p.id = item.portfolio_id
      JOIN benchmark_catalog previous ON previous.id = item.previous_benchmark_id
      JOIN benchmark_catalog requested ON requested.id = item.requested_benchmark_id
      WHERE item.change_request_id = ${id} ORDER BY p.name`;
  } catch {
    // items table or related tables may not exist — return empty items list
  }

  return {
    id: String(row.id), reference: String(row.reference), changeType: String(row.change_type),
    clientName: String(row.client_name), clientReference: String(row.client_reference),
    clientId: String(row.client_id),
    requestedBy: String(row.requested_by), rationale: String(row.rationale),
    effectiveDate: String(row.effective_date), status: String(row.status),
    createdAt: String(row.created_at),
    slaLeadWeeks: row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1,
    statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
    processedAt: row.processed_at ? String(row.processed_at) : null,
    processedBy: row.processed_by ? String(row.processed_by) : null,
    validatedAt: row.validated_at ? String(row.validated_at) : null,
    validatedBy: row.validated_by ? String(row.validated_by) : null,
    notificationSent: Boolean(row.notification_sent ?? false),
    items: items.map((item) => ({
      portfolioName: String(item.portfolio_name), portfolioReference: String(item.portfolio_reference),
      previousBenchmark: { id: String(item.previous_id), code: String(item.previous_code), name: String(item.previous_name), assetClass: String(item.previous_asset_class), currency: String(item.previous_currency), cost: Number(item.previous_cost ?? 1000), provider: String(item.previous_provider ?? 'rimes') },
      requestedBenchmark: { id: String(item.requested_id), code: String(item.requested_code), name: String(item.requested_name), assetClass: String(item.requested_asset_class), currency: String(item.requested_currency), cost: Number(item.requested_cost ?? 1000), provider: String(item.requested_provider ?? 'rimes') },
    })),
    newBenchmark: newBenchmarkData,
  };
}

export async function getAllChangeRequests(): Promise<ChangeRequestSummary[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at,
        c.name AS client_name,
        (SELECT COUNT(*) FROM change_request_items WHERE change_request_id = cr.id)::int AS item_count
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      reference: String(row.reference),
      clientName: String(row.client_name),
      changeType: String(row.change_type),
      status: String(row.status),
      createdAt: String(row.created_at),
      slaLeadWeeks: row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1,
      statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
      itemCount: Number(row.item_count ?? 0),
    }));
  } catch {
    try {
      await ensureReadTables(sql);
      const rows = await sql`
        SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at,
          c.name AS client_name,
          (SELECT COUNT(*) FROM change_request_items WHERE change_request_id = cr.id)::int AS item_count
        FROM change_requests cr
        JOIN clients c ON c.id = cr.client_id
        ORDER BY cr.created_at DESC
      `;
      return rows.map((row: any) => ({
        id: String(row.id),
        reference: String(row.reference),
        clientName: String(row.client_name),
        changeType: String(row.change_type),
        status: String(row.status),
        createdAt: String(row.created_at),
        slaLeadWeeks: row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        itemCount: Number(row.item_count ?? 0),
      }));
    } catch {
      return [];
    }
  }
}

export async function updateChangeStatus(id: string, newStatus: ChangeStatus, userName?: string): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  const updates: string[] = [`status = '${newStatus}'`, `status_updated_at = now()`];
  if (newStatus === 'processed' && userName) {
    updates.push(`processed_at = CURRENT_DATE`);
    updates.push(`processed_by = '${userName.replace(/'/g, "''")}'`);
  }
  if (newStatus === 'validated' && userName) {
    updates.push(`validated_at = CURRENT_DATE`);
    updates.push(`validated_by = '${userName.replace(/'/g, "''")}'`);
  }
  await sql.unsafe(`UPDATE change_requests SET ${updates.join(', ')} WHERE id = '${id}'`);
}

export async function updateNotificationSent(id: string): Promise<void> {
  if (!sql) return;
  await sql`UPDATE change_requests SET notification_sent = true WHERE id = ${id}`;
}
