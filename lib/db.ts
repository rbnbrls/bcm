import postgres from "postgres";
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";
import type { AuditLogEntry, Approval, Benchmark, ChangeRequest, ChangeFieldValue, ChangeTypeConfig, ClientConfig, StakeholderAssignment, WebhookConfig } from "@/lib/types";

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
  // Generic change-type model fields
  changeTypeId?: string;
  fields?: ChangeFieldValue[];
  estimatedCost?: number;
  estimatedCostCurrency?: string;
  estimatedLeadDays?: number;
  stakeholderAssignments?: StakeholderAssignment[];
}) {
  if (!sql) throw new Error("Database niet bereikbaar. Start eerst de PostgreSQL-service.");
  await (sql as any).begin(async (transaction: any) => {
    await ensureTables(transaction);
    await ensureAuditTables(transaction);
    await ensureChangeTypeConfigTable(sql);
    await transaction`
      INSERT INTO change_requests (
        id, reference, change_type, change_type_id, client_id, requested_by, rationale, effective_date, status,
        fields, stakeholders, estimated_cost, estimated_cost_currency, estimated_lead_days
      ) VALUES (
        ${input.id}, ${input.reference}, ${input.changeType}, ${input.changeTypeId ?? null},
        ${input.clientId}, ${input.requestedBy}, ${input.rationale}, ${input.effectiveDate}, 'pending_approval',
        ${input.fields ? JSON.stringify(input.fields) : '[]'}::jsonb,
        ${input.stakeholderAssignments ? JSON.stringify(input.stakeholderAssignments) : '[]'}::jsonb,
        ${input.estimatedCost ?? null}, ${input.estimatedCostCurrency ?? 'EUR'}, ${input.estimatedLeadDays ?? null}
      )
    `;
    for (const item of input.items) {
      await transaction`INSERT INTO change_request_items (id, change_request_id, portfolio_id, previous_benchmark_id, requested_benchmark_id) VALUES (${item.id}, ${input.id}, ${item.portfolioId}, ${item.previousBenchmarkId}, ${item.requestedBenchmarkId})`;
    }
    // Record initial submission in audit log
    await transaction`
      INSERT INTO audit_log (id, change_request_id, action, actor, previous_status, new_status, client_config_version)
      VALUES (${input.id + '-audit-request'}, ${input.id}, 'requested', ${input.requestedBy}, NULL, 'pending_approval', '1.0')
    `;
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

/**
 * Update the status of a change request and record it in the audit log.
 */
export async function updateChangeRequestStatus(
  changeRequestId: string,
  newStatus: string,
  actor: string,
  diffSnapshot?: Record<string, unknown>
): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  // Get current status first
  const [row] = await sql`SELECT status FROM change_requests WHERE id = ${changeRequestId}`;
  if (!row) throw new Error("Change request niet gevonden.");
  const previousStatus = String(row.status);

  await (sql as any).begin(async (transaction: any) => {
    await ensureAuditTables(transaction);
    await transaction`UPDATE change_requests SET status = ${newStatus} WHERE id = ${changeRequestId}`;
    await transaction`
      INSERT INTO audit_log (id, change_request_id, action, actor, previous_status, new_status, diff_snapshot)
      VALUES (${changeRequestId + '-audit-' + Date.now()}, ${changeRequestId}, 'status_change', ${actor}, ${previousStatus}, ${newStatus}, ${diffSnapshot ? JSON.stringify(diffSnapshot) : null})
    `;
  });
}

/**
 * Record an approval or rejection for a change request.
 */
export async function saveApproval(input: {
  changeRequestId: string;
  approver: string;
  decision: string; // 'approved' | 'rejected'
  remarks: string | null;
}): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");

  await (sql as any).begin(async (transaction: any) => {
    await ensureAuditTables(transaction);
    const approvalId = input.changeRequestId + '-app-' + Date.now();
    const newStatus = input.decision === 'approved' ? 'approved' : 'rejected';
    const auditAction = input.decision === 'approved' ? 'approved' : 'rejected';

    // Get current status
    const [row] = await transaction`SELECT status FROM change_requests WHERE id = ${input.changeRequestId}`;
    if (!row) throw new Error("Change request niet gevonden.");
    const previousStatus = String(row.status);

    // Insert approval record
    await transaction`
      INSERT INTO approvals (id, change_request_id, approver, decision, remarks)
      VALUES (${approvalId}, ${input.changeRequestId}, ${input.approver}, ${input.decision}, ${input.remarks})
    `;

    // Update change request status
    await transaction`UPDATE change_requests SET status = ${newStatus} WHERE id = ${input.changeRequestId}`;

    // Record in audit log
    await transaction`
      INSERT INTO audit_log (id, change_request_id, action, actor, previous_status, new_status)
      VALUES (${approvalId + '-audit'}, ${input.changeRequestId}, ${auditAction}, ${input.approver}, ${previousStatus}, ${newStatus})
    `;
  });
}

/**
 * Get audit log entries for a change request.
 */
export async function getAuditLogs(changeRequestId: string): Promise<AuditLogEntry[]> {
  if (!sql) return [];
  await ensureAuditTables(sql).catch(() => {});
  try {
    const rows = await sql`
      SELECT id, change_request_id, action, actor, previous_status, new_status, diff_snapshot, client_config_version, created_at
      FROM audit_log
      WHERE change_request_id = ${changeRequestId}
      ORDER BY created_at ASC
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      changeRequestId: String(row.change_request_id),
      action: String(row.action),
      actor: String(row.actor),
      previousStatus: row.previous_status ? String(row.previous_status) : null,
      newStatus: String(row.new_status),
      diffSnapshot: row.diff_snapshot as Record<string, unknown> | null,
      clientConfigVersion: row.client_config_version ? String(row.client_config_version) : null,
      createdAt: String(row.created_at),
    }));
  } catch {
    return [];
  }
}

/**
 * Get approvals for a change request.
 */
export async function getApprovals(changeRequestId: string): Promise<Approval[]> {
  if (!sql) return [];
  await ensureAuditTables(sql).catch(() => {});
  try {
    const rows = await sql`
      SELECT id, change_request_id, approver, decision, remarks, created_at
      FROM approvals
      WHERE change_request_id = ${changeRequestId}
      ORDER BY created_at ASC
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      changeRequestId: String(row.change_request_id),
      approver: String(row.approver),
      decision: String(row.decision),
      remarks: row.remarks ? String(row.remarks) : null,
      createdAt: String(row.created_at),
    }));
  } catch {
    return [];
  }
}

/**
 * Get change history for a specific client (by client external reference).
 */
export async function getChangeHistoryByClient(clientReference: string): Promise<ChangeRequest[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at,
        c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      WHERE c.external_reference = ${clientReference}
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      reference: String(row.reference),
      changeType: String(row.change_type),
      clientName: String(row.client_name),
      clientReference: String(row.client_reference),
      clientId: String(row.client_id),
      requestedBy: String(row.requested_by),
      rationale: String(row.rationale),
      effectiveDate: String(row.effective_date),
      status: String(row.status),
      createdAt: String(row.created_at),
      items: [],
    }));
  } catch {
    return [];
  }
}

/**
 * Get change history for a specific portfolio (by portfolio external reference).
 */
export async function getChangeHistoryByPortfolio(portfolioReference: string): Promise<ChangeRequest[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT DISTINCT cr.id, cr.reference, cr.change_type, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at,
        c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      JOIN change_request_items cri ON cri.change_request_id = cr.id
      JOIN portfolios p ON p.id = cri.portfolio_id
      WHERE p.external_reference = ${portfolioReference}
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      reference: String(row.reference),
      changeType: String(row.change_type),
      clientName: String(row.client_name),
      clientReference: String(row.client_reference),
      clientId: String(row.client_id),
      requestedBy: String(row.requested_by),
      rationale: String(row.rationale),
      effectiveDate: String(row.effective_date),
      status: String(row.status),
      createdAt: String(row.created_at),
      items: [],
    }));
  } catch {
    return [];
  }
}

/**
 * Get all unique clients that have change requests (for the history overview).
 */
export async function getClientsWithChanges(): Promise<Array<{ id: string; name: string; externalReference: string; changeCount: number }>> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT c.id, c.name, c.external_reference, COUNT(cr.id)::int AS change_count
      FROM clients c
      JOIN change_requests cr ON cr.client_id = c.id
      GROUP BY c.id, c.name, c.external_reference
      ORDER BY c.name
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      externalReference: String(row.external_reference),
      changeCount: Number(row.change_count),
    }));
  } catch {
    return [];
  }
}

/* ── Table creation helpers ── */

async function ensureAuditTables(transaction: any): Promise<void> {
  for (const ddl of [
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
  ]) {
    try { await transaction.unsafe(ddl); } catch { /* table may already exist */ }
  }
}

async function ensureChangeTypeConfigTable(sqlClient: any): Promise<void> {
  try {
    await sqlClient`SELECT 1 FROM change_type_config LIMIT 0`;
  } catch {
    console.log("[db] change_type_config table missing — creating on demand…");
    await sqlClient.unsafe(`
      CREATE TABLE IF NOT EXISTS change_type_config (
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
      )
    `);
    // Seed the default types on first creation
    try {
      await seedChangeTypeConfigs(sqlClient);
    } catch (err) {
      console.warn("[db] Could not seed default change types:", err instanceof Error ? err.message : err);
    }
    console.log("[db] change_type_config table created and seeded.");
  }
}

async function ensureReadTables(sqlClient: any): Promise<void> {
  const REQUIRED_TABLES = ["clients", "benchmark_catalog", "portfolios", "change_requests", "change_request_items", "new_benchmark_requests", "audit_log", "approvals", "change_type_config"];
  const DDL_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS clients (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, external_reference text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS benchmark_catalog (id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, asset_class text NOT NULL, currency text NOT NULL, cost numeric(10,2) NOT NULL DEFAULT 1000.00, provider text NOT NULL DEFAULT 'rimes', active boolean NOT NULL DEFAULT true)`,
    `CREATE TABLE IF NOT EXISTS portfolios (id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE, name text NOT NULL, external_reference text NOT NULL, current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id), currency text NOT NULL DEFAULT 'EUR', active boolean NOT NULL DEFAULT true, UNIQUE (client_id, external_reference))`,
    `CREATE TABLE IF NOT EXISTS change_requests (id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, change_type text NOT NULL, client_id uuid NOT NULL REFERENCES clients(id), requested_by text NOT NULL, rationale text NOT NULL, effective_date date NOT NULL, status text NOT NULL DEFAULT 'draft', sla_lead_weeks integer NOT NULL DEFAULT 1, status_updated_at timestamptz NOT NULL DEFAULT now(), processed_at date, processed_by text, validated_at date, validated_by text, notification_sent boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS change_request_items (id uuid PRIMARY KEY, change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE, portfolio_id uuid NOT NULL REFERENCES portfolios(id), previous_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id), requested_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id), UNIQUE(change_request_id, portfolio_id))`,
    `CREATE TABLE IF NOT EXISTS new_benchmark_requests (id uuid PRIMARY KEY, change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE, short_name text NOT NULL, long_name text NOT NULL, asset_class text NOT NULL, currency text NOT NULL DEFAULT 'EUR', estimated_cost numeric(10,2) NOT NULL DEFAULT 5000.00, estimated_lead_weeks integer NOT NULL DEFAULT 4)`,
    `CREATE TABLE IF NOT EXISTS audit_log (id text PRIMARY KEY, change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE, action text NOT NULL, actor text NOT NULL, previous_status text, new_status text NOT NULL, diff_snapshot jsonb, client_config_version text, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS approvals (id text PRIMARY KEY, change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE, approver text NOT NULL, decision text NOT NULL, remarks text, created_at timestamptz NOT NULL DEFAULT now())`,
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
    // Generic change-type model columns (Phase 1)
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS change_type_id uuid REFERENCES change_type_config(id)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost numeric(10,2)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost_currency text NOT NULL DEFAULT 'EUR'`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_lead_days integer`,
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
      SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.sla_lead_weeks, cr.status_updated_at, cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by, cr.notification_sent, cr.created_at, cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments, cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days, c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ${id}`;
  } catch {
    try {
      await ensureReadTables(sql);
      header = await sql`
        SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.sla_lead_weeks, cr.status_updated_at, cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by, cr.notification_sent, cr.created_at, cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments, cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days, c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
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

  // Resolve change type config
  let changeTypeConfig: ChangeTypeConfig | undefined;
  const changeTypeSlug = String(row.change_type);
  if (row.change_type_id) {
    try {
      const ctRows = await sql`
        SELECT id, slug, name, description, category, fields, ist_soll_mapping, cost,
          default_lead_days, stakeholders, workflow, active, sort_order, created_at, updated_at
        FROM change_type_config WHERE id = ${row.change_type_id} LIMIT 1
      `;
      if (ctRows.length > 0) {
        changeTypeConfig = mapChangeTypeRow(ctRows[0]);
      }
    } catch {
      // change_type_config may not exist yet — fall back to slug-based lookup
    }
  }
  if (!changeTypeConfig) {
    // Fallback: look up by slug for backward compatibility
    try {
      const ctRows = await sql`
        SELECT id, slug, name, description, category, fields, ist_soll_mapping, cost,
          default_lead_days, stakeholders, workflow, active, sort_order, created_at, updated_at
        FROM change_type_config WHERE slug = ${changeTypeSlug} LIMIT 1
      `;
      if (ctRows.length > 0) {
        changeTypeConfig = mapChangeTypeRow(ctRows[0]);
      }
    } catch {
      // change_type_config table may not exist — ignore
    }
  }

  // Parse generic fields from the DB (if stored in the new jsonb column)
  let genericFields: ChangeFieldValue[] | undefined;
  if (row.generic_fields) {
    try {
      const parsed = typeof row.generic_fields === 'string' ? JSON.parse(row.generic_fields) : row.generic_fields;
      if (Array.isArray(parsed)) genericFields = parsed as ChangeFieldValue[];
    } catch {
      // ignore parse errors
    }
  }

  // Parse stakeholder assignments from the DB
  let stakeholderAssignments: StakeholderAssignment[] | undefined;
  if (row.stakeholder_assignments) {
    try {
      const parsed = typeof row.stakeholder_assignments === 'string' ? JSON.parse(row.stakeholder_assignments) : row.stakeholder_assignments;
      if (Array.isArray(parsed)) stakeholderAssignments = parsed as StakeholderAssignment[];
    } catch {
      // ignore parse errors
    }
  }

  return {
    id: String(row.id), reference: String(row.reference), changeType: changeTypeSlug, clientName: String(row.client_name), clientReference: String(row.client_reference), clientId: String(row.client_id), requestedBy: String(row.requested_by), rationale: String(row.rationale), effectiveDate: String(row.effective_date), status: String(row.status), slaLeadWeeks: row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1, statusUpdatedAt: String(row.status_updated_at ?? row.created_at), processedAt: row.processed_at ? String(row.processed_at) : null, processedBy: row.processed_by ? String(row.processed_by) : null, validatedAt: row.validated_at ? String(row.validated_at) : null, validatedBy: row.validated_by ? String(row.validated_by) : null, notificationSent: Boolean(row.notification_sent), createdAt: String(row.created_at),
    items: items.map((item) => ({
      portfolioName: String(item.portfolio_name), portfolioReference: String(item.portfolio_reference),
      previousBenchmark: { id: String(item.previous_id), code: String(item.previous_code), name: String(item.previous_name), assetClass: String(item.previous_asset_class), currency: String(item.previous_currency), cost: Number(item.previous_cost ?? 1000), provider: String(item.previous_provider ?? 'rimes') },
      requestedBenchmark: { id: String(item.requested_id), code: String(item.requested_code), name: String(item.requested_name), assetClass: String(item.requested_asset_class), currency: String(item.requested_currency), cost: Number(item.requested_cost ?? 1000), provider: String(item.requested_provider ?? 'rimes') },
    })),
    newBenchmark: newBenchmarkData,
    changeTypeConfig,
    fields: genericFields,
    estimatedCost: row.estimated_cost != null ? Number(row.estimated_cost) : undefined,
    estimatedCostCurrency: row.estimated_cost_currency ? String(row.estimated_cost_currency) : undefined,
    estimatedLeadDays: row.estimated_lead_days != null ? Number(row.estimated_lead_days) : undefined,
    stakeholderAssignments,
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

// ── Change Type Config ──

function mapChangeTypeRow(row: Record<string, unknown>): ChangeTypeConfig {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ''),
    category: String(row.category ?? 'general'),
    fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : (Array.isArray(row.fields) ? row.fields : []),
    istSollMapping: row.ist_soll_mapping
      ? (typeof row.ist_soll_mapping === 'string' ? JSON.parse(row.ist_soll_mapping) : row.ist_soll_mapping as any)
      : undefined,
    cost: typeof row.cost === 'string' ? JSON.parse(row.cost) : (typeof row.cost === 'object' && row.cost !== null ? row.cost : { baseCost: 0, costCurrency: 'EUR', description: '' }),
    defaultLeadDays: Number(row.default_lead_days ?? 5),
    stakeholders: typeof row.stakeholders === 'string' ? JSON.parse(row.stakeholders) : (Array.isArray(row.stakeholders) ? row.stakeholders : []),
    workflow: String(row.workflow ?? 'default'),
    active: Boolean(row.active ?? true),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function getChangeTypes(): Promise<ChangeTypeConfig[]> {
  if (!sql) return getDefaultChangeTypeConfigs();
  for (const attempt of [1, 2]) {
    try {
      await ensureChangeTypeConfigTable(sql);
      const rows = await sql`
        SELECT id, slug, name, description, category, fields, ist_soll_mapping, cost,
          default_lead_days, stakeholders, workflow, active, sort_order, created_at, updated_at
        FROM change_type_config
        WHERE active = true OR active IS NULL
        ORDER BY sort_order, name
      `;
      return rows.map(mapChangeTypeRow);
    } catch {
      if (attempt === 1) {
        try {
          await ensureChangeTypeConfigTable(sql);
        } catch {
          // table creation failed — fall through to retry or default
        }
      }
    }
  }
  return getDefaultChangeTypeConfigs();
}

export async function getChangeTypeBySlug(slug: string): Promise<ChangeTypeConfig | null> {
  if (!sql) {
    const defaults = getDefaultChangeTypeConfigs();
    return defaults.find((ct) => ct.slug === slug) ?? null;
  }
  for (const attempt of [1, 2]) {
    try {
      await ensureChangeTypeConfigTable(sql);
      const rows = await sql`
        SELECT id, slug, name, description, category, fields, ist_soll_mapping, cost,
          default_lead_days, stakeholders, workflow, active, sort_order, created_at, updated_at
        FROM change_type_config
        WHERE slug = ${slug}
        LIMIT 1
      `;
      if (rows.length === 0) return null;
      return mapChangeTypeRow(rows[0]);
    } catch {
      if (attempt === 1) {
        try {
          await ensureChangeTypeConfigTable(sql);
        } catch {
          // fall through
        }
      }
    }
  }
  return null;
}

export async function seedChangeTypeConfigs(sqlClient?: any): Promise<number> {
  const db = sqlClient ?? sql;
  if (!db) return 0;

  const defaultTypes = getDefaultChangeTypeConfigs();
  let seededCount = 0;

  for (const ct of defaultTypes) {
    try {
      const existing = await db`SELECT id FROM change_type_config WHERE slug = ${ct.slug} LIMIT 1`;
      if (existing.length > 0) continue;

      await db`
        INSERT INTO change_type_config (id, slug, name, description, category, fields, ist_soll_mapping, cost, default_lead_days, stakeholders, workflow, active, sort_order)
        VALUES (
          ${ct.id}, ${ct.slug}, ${ct.name}, ${ct.description}, ${ct.category},
          ${JSON.stringify(ct.fields)}::jsonb,
          ${ct.istSollMapping ? JSON.stringify(ct.istSollMapping) : null}::jsonb,
          ${JSON.stringify(ct.cost)}::jsonb,
          ${ct.defaultLeadDays},
          ${JSON.stringify(ct.stakeholders)}::jsonb,
          ${ct.workflow}, ${ct.active}, ${ct.sortOrder}
        )
      `;
      seededCount++;
      console.log(`[db] Seeded change type: ${ct.slug}`);
    } catch (err) {
      console.warn(`[db] Could not seed change type "${ct.slug}":`, err instanceof Error ? err.message : err);
    }
  }
  return seededCount;
}

/** Return the two default change type configs (benchmark_switch + new_benchmark) as in-memory objects. */
function getDefaultChangeTypeConfigs(): ChangeTypeConfig[] {
  return [
    {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'benchmark_switch',
      name: 'Benchmarkwissel',
      description: 'Wijzig de benchmark van een of meerdere portefeuilles.',
      category: 'benchmark',
      fields: [
        { key: 'portfolio_id', label: 'Portefeuille', type: 'select', required: true, referenceTable: 'portfolios' },
        { key: 'current_benchmark_id', label: 'Huidige benchmark (IST)', type: 'benchmark', required: true, referenceTable: 'benchmark_catalog' },
        { key: 'requested_benchmark_id', label: 'Gewenste benchmark (SOLL)', type: 'benchmark', required: true, referenceTable: 'benchmark_catalog' },
      ],
      istSollMapping: [
        { ist: 'current_benchmark_id', soll: 'requested_benchmark_id', labelIst: 'Huidige benchmark', labelSoll: 'Gewenste benchmark' },
      ],
      cost: { baseCost: 0, costCurrency: 'EUR', perItemCost: 500, description: '€ 500 per portefeuille (administratiekosten)' },
      defaultLeadDays: 7,
      stakeholders: [
        { id: 'internal_admin', name: 'Eigen administratie', role: 'Administratie', notifyOn: ['on_submit', 'on_approval'], mandatory: true, contactType: 'webhook' },
        { id: 'asset_service_provider', name: 'Asset service provider', role: 'Portefeuilleadministratie', notifyOn: ['on_approval'], mandatory: true, contactType: 'webhook' },
        { id: 'factset', name: 'FactSet', role: 'Performancemeting', notifyOn: ['on_completion'], mandatory: false, contactType: 'webhook' },
      ],
      workflow: 'benchmark_switch',
      active: true,
      sortOrder: 10,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      slug: 'new_benchmark',
      name: 'Nieuwe benchmark',
      description: 'Vraag een nieuwe benchmark aan die nog niet in de catalogus staat.',
      category: 'benchmark',
      fields: [
        { key: 'short_name', label: 'Short name', type: 'text', required: true, maxLength: 20, helpText: 'Verkorte code, bijvoorbeeld MSCI-WRLD-NL' },
        { key: 'long_name', label: 'Long name', type: 'text', required: true, maxLength: 200 },
        { key: 'asset_class', label: 'Asset class', type: 'select', required: true, options: [
          { value: 'Aandelen', label: 'Aandelen' }, { value: 'Obligaties', label: 'Obligaties' },
          { value: 'Vastgoed', label: 'Vastgoed' }, { value: 'Alternatieven', label: 'Alternatieven' },
          { value: 'Liquiditeiten', label: 'Liquiditeiten' }, { value: 'Private Equity', label: 'Private Equity' },
          { value: 'Infrastructure', label: 'Infrastructure' }, { value: 'Grondstoffen', label: 'Grondstoffen' },
        ]},
        { key: 'currency', label: 'Valuta', type: 'select', required: true, defaultValue: 'EUR', options: [
          { value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }, { value: 'GBP', label: 'GBP' },
        ]},
      ],
      istSollMapping: [],
      cost: { baseCost: 5000, costCurrency: 'EUR', description: '€ 5.000 eenmalige onderzoekskosten' },
      defaultLeadDays: 28,
      stakeholders: [
        { id: 'research', name: 'Research team', role: 'Benchmarkonderzoek', notifyOn: ['on_submit'], mandatory: true, contactType: 'email' },
        { id: 'internal_admin', name: 'Eigen administratie', role: 'Administratie', notifyOn: ['on_approval'], mandatory: true, contactType: 'webhook' },
      ],
      workflow: 'new_benchmark',
      active: true,
      sortOrder: 20,
      createdAt: '',
      updatedAt: '',
    },
  ];
}
