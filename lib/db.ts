import postgres from "postgres";
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";
import type { AuditLogEntry, Approval, Benchmark, ChangeRequest, ChangeRequestSummary, ClientConfig, ChangeStatus, StatusHistoryEntry, WebhookConfig, ChangeFieldValue, StakeholderAssignment, ChangeTypeConfig } from "@/lib/types";
import { CHANGE_STATUS_LABELS, computeSlaStatus } from "@/lib/types";

// ── Notification types (used both in db.ts and externally) ──────────────────

export type NotificationConfigRow = {
  id: string;
  stakeholder: string;
  channel: "webhook" | "email";
  recipient: string;
  isActive: boolean;
  changeRequestId: string | null;
  createdAt: string;
};

export type NotificationLogRow = {
  id: string;
  changeRequestId: string;
  stakeholder: string;
  channel: "webhook" | "email";
  recipient: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  response: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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

export async function insertBenchmarksBulk(
  benchmarks: Array<{
    id: string; code: string; name: string; assetClass: string;
    currency: string; cost: number; provider: string;
  }>
): Promise<{ inserted: number; skipped: number }> {
  if (!sql) throw new Error("Database niet bereikbaar.");

  // Determine which codes already exist (updates) vs new (inserts)
  const codes = benchmarks.map((b) => b.code);
  const existing = await sql`SELECT code FROM benchmark_catalog WHERE code = ANY(${codes})`;
  const existingCodes = new Set(existing.map((r: any) => String(r.code)));

  let inserted = 0;
  let skipped = 0;

  for (const b of benchmarks) {
    if (existingCodes.has(b.code)) {
      await sql`
        UPDATE benchmark_catalog SET
          name = ${b.name},
          asset_class = ${b.assetClass},
          currency = ${b.currency},
          cost = ${b.cost},
          provider = ${b.provider}
        WHERE code = ${b.code}
      `;
      skipped++;
    } else {
      await sql`
        INSERT INTO benchmark_catalog (id, code, name, asset_class, currency, cost, provider)
        VALUES (${b.id}, ${b.code}, ${b.name}, ${b.assetClass}, ${b.currency}, ${b.cost}, ${b.provider})
      `;
      inserted++;
    }
  }

  return { inserted, skipped };
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
        INSERT INTO change_requests (
          id, reference, change_type, change_type_id, client_id, requested_by, rationale, effective_date, status,
          sla_lead_weeks, status_updated_at, submitted_at,
          fields, stakeholders, estimated_cost, estimated_cost_currency, estimated_lead_days
        ) VALUES (
          ${input.id}, ${input.reference}, ${input.changeType}, ${input.changeTypeId ?? null},
          ${input.clientId}, ${input.requestedBy}, ${input.rationale}, ${input.effectiveDate}, 'submitted',
          ${sla}, now(), now(),
          ${input.fields ? JSON.stringify(input.fields) : '[]'}::jsonb,
          ${input.stakeholderAssignments ? JSON.stringify(input.stakeholderAssignments) : '[]'}::jsonb,
          ${input.estimatedCost ?? null}, ${input.estimatedCostCurrency ?? 'EUR'}, ${input.estimatedLeadDays ?? null}
        )
      `;
    } else {
      await transaction`
        INSERT INTO change_requests (id, reference, change_type, client_id, requested_by, rationale, effective_date, status, submitted_at)
        VALUES (${input.id}, ${input.reference}, ${input.changeType}, ${input.clientId}, ${input.requestedBy}, ${input.rationale}, ${input.effectiveDate}, 'submitted', now())
      `;
    }
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
      SELECT cr.id, cr.reference, cr.change_type, cr.requested_by, cr.rationale,
        cr.effective_date, cr.status, cr.created_at, cr.submitted_at,
        cr.sla_lead_weeks, cr.status_updated_at,
        cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by,
        cr.notification_sent, cr.submitted_at,
        c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      WHERE c.external_reference = ${clientReference}
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const sla = computeSlaStatus(String(row.created_at), Number(row.sla_lead_weeks ?? 1), String(row.status));
      return {
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
        submittedAt: row.submitted_at ? String(row.submitted_at) : null,
        slaLeadWeeks: Number(row.sla_lead_weeks ?? 1),
        daysOpen: sla.daysOpen,
        slaStatus: sla.slaStatus,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        processedAt: row.processed_at ? String(row.processed_at) : null,
        processedBy: row.processed_by ? String(row.processed_by) : null,
        validatedAt: row.validated_at ? String(row.validated_at) : null,
        validatedBy: row.validated_by ? String(row.validated_by) : null,
        notificationSent: Boolean(row.notification_sent),
        items: [],
      };
    });
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
      SELECT DISTINCT cr.id, cr.reference, cr.change_type, cr.requested_by, cr.rationale,
        cr.effective_date, cr.status, cr.created_at, cr.submitted_at,
        cr.sla_lead_weeks, cr.status_updated_at,
        cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by,
        cr.notification_sent, cr.submitted_at,
        c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      JOIN change_request_items cri ON cri.change_request_id = cr.id
      JOIN portfolios p ON p.id = cri.portfolio_id
      WHERE p.external_reference = ${portfolioReference}
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const sla = computeSlaStatus(String(row.created_at), Number(row.sla_lead_weeks ?? 1), String(row.status));
      return {
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
        submittedAt: row.submitted_at ? String(row.submitted_at) : null,
        slaLeadWeeks: Number(row.sla_lead_weeks ?? 1),
        daysOpen: sla.daysOpen,
        slaStatus: sla.slaStatus,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        processedAt: row.processed_at ? String(row.processed_at) : null,
        processedBy: row.processed_by ? String(row.processed_by) : null,
        validatedAt: row.validated_at ? String(row.validated_at) : null,
        validatedBy: row.validated_by ? String(row.validated_by) : null,
        notificationSent: Boolean(row.notification_sent),
        items: [],
      };
    });
  } catch {
    return [];
  }
}

/**
 * Check which portfolio IDs have open (non-finalized) change requests.
 * Returns a Set of portfolio IDs that are already part of an active change.
 */
export async function getConflictingPortfolioIds(portfolioIds: string[]): Promise<Set<string>> {
  if (!sql || portfolioIds.length === 0) return new Set();
  try {
    const rows = await sql`
      SELECT DISTINCT cri.portfolio_id
      FROM change_request_items cri
      JOIN change_requests cr ON cr.id = cri.change_request_id
      WHERE cri.portfolio_id = ANY(${portfolioIds})
        AND cr.status IN ('draft', 'pending_approval')
    `;
    return new Set(rows.map((r: any) => String(r.portfolio_id)));
  } catch {
    return new Set();
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
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS submitted_at timestamptz`,
    `CREATE TABLE IF NOT EXISTS status_history (
      id uuid PRIMARY KEY,
      change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
      from_status text,
      to_status text NOT NULL,
      changed_by text,
      changed_at timestamptz NOT NULL DEFAULT now()
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
      SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at, cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by, cr.notification_sent, cr.submitted_at,
        cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments,
        cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days,
        c.id AS client_id, c.name AS client_name, c.external_reference AS client_reference
      FROM change_requests cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ${id}`;
  } catch {
    try {
      await ensureReadTables(sql);
      header = await sql`
        SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at, cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by, cr.notification_sent, cr.submitted_at,
          cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments,
          cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days,
          c.id AS client_id, c.name AS client_name, c.external_reference AS client_reference
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
        changeTypeConfig = mapRowToChangeTypeConfig(ctRows[0]);
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
        changeTypeConfig = mapRowToChangeTypeConfig(ctRows[0]);
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

  const slaLeadWeeks = row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1;
  const { daysOpen, slaStatus } = computeSlaStatus(
    String(row.created_at),
    slaLeadWeeks,
    String(row.status)
  );

  return {
    id: String(row.id), reference: String(row.reference), changeType: changeTypeSlug,
    clientName: String(row.client_name), clientReference: String(row.client_reference),
    clientId: String(row.client_id),
    requestedBy: String(row.requested_by), rationale: String(row.rationale),
    effectiveDate: String(row.effective_date), status: String(row.status),
    createdAt: String(row.created_at),
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    slaLeadWeeks,
    daysOpen,
    slaStatus,
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
      SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at, cr.submitted_at,
        c.name AS client_name,
        (SELECT COUNT(*) FROM change_request_items WHERE change_request_id = cr.id)::int AS item_count
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const slaWeeks = row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1;
      const { daysOpen, slaStatus } = computeSlaStatus(String(row.created_at), slaWeeks, String(row.status));
      return {
        id: String(row.id),
        reference: String(row.reference),
        clientName: String(row.client_name),
        changeType: String(row.change_type),
        status: String(row.status),
        createdAt: String(row.created_at),
        submittedAt: row.submitted_at ? String(row.submitted_at) : null,
        slaLeadWeeks: slaWeeks,
        daysOpen,
        slaStatus,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        itemCount: Number(row.item_count ?? 0),
      };
    });
  } catch {
    try {
      await ensureReadTables(sql);
      const rows = await sql`
        SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at, cr.submitted_at,
          c.name AS client_name,
          (SELECT COUNT(*) FROM change_request_items WHERE change_request_id = cr.id)::int AS item_count
        FROM change_requests cr
        JOIN clients c ON c.id = cr.client_id
        ORDER BY cr.created_at DESC
      `;
      return rows.map((row: any) => {
        const slaWeeks = row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1;
        const { daysOpen, slaStatus } = computeSlaStatus(String(row.created_at), slaWeeks, String(row.status));
        return {
          id: String(row.id),
          reference: String(row.reference),
          clientName: String(row.client_name),
          changeType: String(row.change_type),
          status: String(row.status),
          createdAt: String(row.created_at),
          submittedAt: row.submitted_at ? String(row.submitted_at) : null,
          slaLeadWeeks: slaWeeks,
          daysOpen,
          slaStatus,
          statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
          itemCount: Number(row.item_count ?? 0),
        };
      });
    } catch {
      return [];
    }
  }
}

/**
 * Get all change requests with full data fields for reporting purposes.
 * Includes estimated costs, lead days, client info, processed timestamps.
 */
export async function getAllChangeRequestsFull(): Promise<ChangeRequest[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale,
        cr.effective_date, cr.status, cr.sla_lead_weeks, cr.status_updated_at,
        cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by,
        cr.notification_sent, cr.created_at, cr.submitted_at,
        cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments,
        cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days,
        c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const sla = computeSlaStatus(String(row.created_at), row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1, String(row.status));
      return {
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
        submittedAt: null,
        slaLeadWeeks: row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1,
        daysOpen: sla.daysOpen,
        slaStatus: sla.slaStatus,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        processedAt: row.processed_at ? String(row.processed_at) : null,
        processedBy: row.processed_by ? String(row.processed_by) : null,
        validatedAt: row.validated_at ? String(row.validated_at) : null,
        validatedBy: row.validated_by ? String(row.validated_by) : null,
        notificationSent: Boolean(row.notification_sent),
        items: [],
        estimatedCost: row.estimated_cost != null ? Number(row.estimated_cost) : undefined,
        estimatedCostCurrency: row.estimated_cost_currency ? String(row.estimated_cost_currency) : undefined,
        estimatedLeadDays: row.estimated_lead_days != null ? Number(row.estimated_lead_days) : undefined,
      };
    });
  } catch {
    try {
      await ensureReadTables(sql);
      const rows = await sql`
        SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale,
          cr.effective_date, cr.status, cr.sla_lead_weeks, cr.status_updated_at,
          cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by,
          cr.notification_sent, cr.created_at,
          cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments,
          cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days,
          c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
        FROM change_requests cr
        JOIN clients c ON c.id = cr.client_id
        ORDER BY cr.created_at DESC
      `;
      return rows.map((row: any) => {
        const sla = computeSlaStatus(String(row.created_at), row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1, String(row.status));
        return {
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
        submittedAt: null,
        slaLeadWeeks: row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1,
        daysOpen: sla.daysOpen,
        slaStatus: sla.slaStatus,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        processedAt: row.processed_at ? String(row.processed_at) : null,
        processedBy: row.processed_by ? String(row.processed_by) : null,
        validatedAt: row.validated_at ? String(row.validated_at) : null,
        validatedBy: row.validated_by ? String(row.validated_by) : null,
        notificationSent: Boolean(row.notification_sent),
        items: [],
        estimatedCost: row.estimated_cost != null ? Number(row.estimated_cost) : undefined,
        estimatedCostCurrency: row.estimated_cost_currency ? String(row.estimated_cost_currency) : undefined,
        estimatedLeadDays: row.estimated_lead_days != null ? Number(row.estimated_lead_days) : undefined,
      };
      });
    } catch {
      return [];
    }
  }
}

export async function updateChangeStatus(id: string, newStatus: ChangeStatus, userName?: string): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  await (sql as any).begin(async (tx: any) => {
    // Get current status before updating
    const rows = await tx`SELECT status, submitted_at FROM change_requests WHERE id = ${id}`;
    if (rows.length === 0) throw new Error("Change request niet gevonden.");
    const currentStatus = String(rows[0].status);

    const updates: string[] = [`status = '${newStatus}'`, `status_updated_at = now()`];

    // Set submitted_at when transitioning to 'submitted' for the first time
    if (newStatus === 'submitted' && !rows[0].submitted_at) {
      updates.push(`submitted_at = now()`);
    }

    if (newStatus === 'processed' && userName) {
      updates.push(`processed_at = CURRENT_DATE`);
      updates.push(`processed_by = '${userName.replace(/'/g, "''")}'`);
    }
    if (newStatus === 'validated' && userName) {
      updates.push(`validated_at = CURRENT_DATE`);
      updates.push(`validated_by = '${userName.replace(/'/g, "''")}'`);
    }
    await tx.unsafe(`UPDATE change_requests SET ${updates.join(', ')} WHERE id = '${id}'`);

    // Log status transition
    const historyId = crypto.randomUUID();
    await tx`
      INSERT INTO status_history (id, change_request_id, from_status, to_status, changed_by)
      VALUES (${historyId}, ${id}, ${currentStatus}, ${newStatus}, ${userName ?? null})
    `;

    // Trigger IST sync when a change is processed
    if (newStatus === 'processed') {
      const { istSyncOnProcessed } = await import("./db");
      await istSyncOnProcessed(id);
    }
  });
}

/**
 * IST sync: when a change is processed, update each affected portfolio's
 * current_benchmark_id to the requested (SOLL) benchmark, so the IST
 * configuration reflects the completed change.
 *
 * This function also calls any configured external IST system webhook so the
 * third-party system can mirror the update.
 */
export async function istSyncOnProcessed(changeId: string): Promise<void> {
  if (!sql) return;
  await (sql as any).begin(async (tx: any) => {
    // Fetch all items for this change request
    const items = await tx`
      SELECT portfolio_id, requested_benchmark_id
      FROM change_request_items
      WHERE change_request_id = ${changeId}
    `;

    if (items.length === 0) return;

    for (const item of items) {
      await tx`
        UPDATE portfolios
        SET current_benchmark_id = ${item.requested_benchmark_id}
        WHERE id = ${item.portfolio_id}
      `;
    }

    // Log IST sync to status_history for audit trail
    const logId = crypto.randomUUID();
    await tx`
      INSERT INTO status_history (id, change_request_id, from_status, to_status, changed_by, changed_at)
      VALUES (${logId}, ${changeId}, NULL, 'ist_sync', 'system', now())
    `;
  });

  // External IST webhook — fire-and-forget
  const webhookUrl = process.env.WEBHOOK_IST_SYNC;
  if (webhookUrl) {
    try {
      const changeRequest = await getChangeRequest(changeId);
      if (changeRequest) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ist_sync",
            changeId,
            reference: changeRequest.reference,
            clientName: changeRequest.clientName,
            clientReference: changeRequest.clientReference,
            items: changeRequest.items.map((i) => ({
              portfolioName: i.portfolioName,
              portfolioReference: i.portfolioReference,
              newBenchmarkId: i.requestedBenchmark.id,
              newBenchmarkCode: i.requestedBenchmark.code,
              newBenchmarkName: i.requestedBenchmark.name,
            })),
            effectiveDate: changeRequest.effectiveDate,
            processedAt: new Date().toISOString(),
          }),
        }).catch(() => {
          // Fire-and-forget — don't fail the sync
        });
      }
    } catch {
      // Silent
    }
  }
}

export async function updateNotificationSent(id: string): Promise<void> {
  if (!sql) return;
  await sql`UPDATE change_requests SET notification_sent = true WHERE id = ${id}`;
}

export async function getStatusHistory(changeRequestId: string): Promise<StatusHistoryEntry[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT id, change_request_id, from_status, to_status, changed_by, changed_at
      FROM status_history
      WHERE change_request_id = ${changeRequestId}
      ORDER BY changed_at ASC
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      changeRequestId: String(row.change_request_id),
      fromStatus: row.from_status ? (String(row.from_status) as any) : null,
      toStatus: String(row.to_status) as any,
      changedBy: row.changed_by ? String(row.changed_by) : null,
      changedAt: String(row.changed_at),
    }));
  } catch { return []; }
}

export async function getChangesBySlaStatus(slaStatus: "ok" | "at_risk" | "overdue"): Promise<ChangeRequestSummary[]> {
  const all = await getAllChangeRequests();
  return all.filter((c) => c.slaStatus === slaStatus);
}

export async function getChangesByStatus(status: string): Promise<ChangeRequestSummary[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.status_updated_at, cr.submitted_at,
        c.name AS client_name,
        (SELECT COUNT(*) FROM change_request_items WHERE change_request_id = cr.id)::int AS item_count
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      WHERE cr.status = ${status}
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const slaWeeks = row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1;
      const { daysOpen, slaStatus } = computeSlaStatus(String(row.created_at), slaWeeks, String(row.status));
      return {
        id: String(row.id),
        reference: String(row.reference),
        clientName: String(row.client_name),
        changeType: String(row.change_type),
        status: String(row.status),
        createdAt: String(row.created_at),
        submittedAt: row.submitted_at ? String(row.submitted_at) : null,
        slaLeadWeeks: slaWeeks,
        daysOpen,
        slaStatus,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        itemCount: Number(row.item_count ?? 0),
      };
    });
  } catch {
    return [];
  }
}

// ── Notification DB functions ────────────────────────────────────────────────

export async function getNotificationConfigs(filters?: {
  stakeholder?: string;
  changeRequestId?: string | null;
}): Promise<NotificationConfigRow[]> {
  if (!sql) return [];
  let query = sql`SELECT * FROM notification_config WHERE 1=1`;
  if (filters?.stakeholder) {
    query = sql`${query} AND stakeholder = ${filters.stakeholder}`;
  }
  if (filters?.changeRequestId) {
    query = sql`${query} AND change_request_id = ${filters.changeRequestId}`;
  } else if (filters?.changeRequestId === undefined) {
    query = sql`${query} AND change_request_id IS NULL`;
  }
  query = sql`${query} ORDER BY stakeholder, channel`;
  try {
    const rows = await query;
    return rows.map((row: any) => ({
      id: String(row.id),
      stakeholder: String(row.stakeholder),
      channel: String(row.channel) as "webhook" | "email",
      recipient: String(row.recipient),
      isActive: Boolean(row.is_active),
      changeRequestId: row.change_request_id ? String(row.change_request_id) : null,
      createdAt: String(row.created_at),
    }));
  } catch {
    return [];
  }
}

export async function saveNotificationConfig(input: {
  id: string;
  stakeholder: string;
  channel: "webhook" | "email";
  recipient: string;
  isActive?: boolean;
  changeRequestId?: string | null;
}): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  await sql`
    INSERT INTO notification_config (id, stakeholder, channel, recipient, is_active, change_request_id)
    VALUES (
      ${input.id},
      ${input.stakeholder},
      ${input.channel},
      ${input.recipient},
      ${input.isActive ?? true},
      ${input.changeRequestId ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      recipient = ${input.recipient},
      is_active = ${input.isActive ?? true},
      change_request_id = ${input.changeRequestId ?? null}
  `;
}

export async function deleteNotificationConfig(id: string): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  await sql`DELETE FROM notification_config WHERE id = ${id}`;
}

export async function logNotificationDelivery(input: {
  id?: string;
  changeRequestId: string;
  stakeholder: string;
  channel: "webhook" | "email";
  recipient: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  response?: string | null;
  nextRetryAt?: string | null;
}): Promise<void> {
  if (!sql) return;
  const logId = input.id || crypto.randomUUID();
  try {
    await sql`
      INSERT INTO notification_log (id, change_request_id, stakeholder, channel, recipient, status, attempts, max_attempts, response, next_retry_at)
      VALUES (
        ${logId},
        ${input.changeRequestId},
        ${input.stakeholder},
        ${input.channel},
        ${input.recipient},
        ${input.status},
        ${input.attempts},
        ${input.maxAttempts},
        ${input.response ?? null},
        ${input.nextRetryAt ?? null}
      )
    `;
  } catch {
    // Best-effort logging
  }
}

export async function getNotificationLog(changeRequestId: string): Promise<NotificationLogRow[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT * FROM notification_log
      WHERE change_request_id = ${changeRequestId}
      ORDER BY created_at DESC
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      changeRequestId: String(row.change_request_id),
      stakeholder: String(row.stakeholder),
      channel: String(row.channel) as "webhook" | "email",
      recipient: String(row.recipient),
      status: String(row.status),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      response: row.response ? String(row.response) : null,
      nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  } catch {
    return [];
  }
}

/** Override the processed_at date after a status transition (used by provider feedback). */
export async function setCustomProcessedDate(
  id: string,
  processedDate: string
): Promise<void> {
  if (!sql) return;
  await sql`UPDATE change_requests SET processed_at = ${processedDate}::date WHERE id = ${id}`;
}

// ── FactSet Submission Tracking ──────────────────────────────────────────────

/**
 * Create a pending FactSet submission record.
 * Registers a new submission in the factset_submissions table, creating
 * the table on demand if it doesn't exist yet.
 */
export async function createFactSetSubmission(input: {
  id: string;
  changeRequestId: string;
  requestBody: Record<string, unknown>;
}): Promise<void> {
  if (!sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS factset_submissions (
        id text PRIMARY KEY,
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        request_body jsonb NOT NULL DEFAULT '{}'::jsonb,
        response_status integer,
        response_body text,
        status text NOT NULL DEFAULT 'pending',
        error_message text,
        retry_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO factset_submissions (id, change_request_id, request_body)
      VALUES (${input.id}, ${input.changeRequestId}, ${JSON.stringify(input.requestBody)}::jsonb)
    `;
  } catch (error) {
    console.error("[db] Failed to create FactSet submission:", error);
  }
}

/**
 * Update a FactSet submission record with response data.
 */
export async function updateFactSetSubmission(
  id: string,
  update: {
    responseStatus?: number;
    responseBody?: string;
    status?: string;
    errorMessage?: string;
    retryCount?: number;
  },
): Promise<void> {
  if (!sql) return;
  try {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (update.responseStatus !== undefined) {
      sets.push(`response_status = $${idx++}`);
      params.push(update.responseStatus);
    }
    if (update.responseBody !== undefined) {
      sets.push(`response_body = $${idx++}`);
      params.push(update.responseBody);
    }
    if (update.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(update.status);
    }
    if (update.errorMessage !== undefined) {
      sets.push(`error_message = $${idx++}`);
      params.push(update.errorMessage);
    }
    if (update.retryCount !== undefined) {
      sets.push(`retry_count = $${idx++}`);
      params.push(update.retryCount);
    }

    if (sets.length === 0) return;

    sets.push(`updated_at = now()`);

    const query = `UPDATE factset_submissions SET ${sets.join(", ")} WHERE id = $${idx}`;
    params.push(id);

    await sql.unsafe(query, params);
  } catch (error) {
    console.error("[db] Failed to update FactSet submission:", error);
  }
}

/**
 * Save a FactSet webhook feedback entry to the database.
 *
 * The table is created on demand if it does not yet exist.
 */
export async function saveFactSetFeedback(input: {
  id: string;
  submissionId: string;
  changeRequestId: string;
  outcome: string;
  message: string;
  externalReference: string | null;
  rawPayload: string;
}): Promise<void> {
  if (!sql) {
    console.warn("[db] No database connection — cannot save FactSet feedback");
    return;
  }
  try {
    await ensureFactSetTables(sql);
    await sql`
      INSERT INTO factset_feedback (id, submission_id, change_request_id, outcome, message, external_reference, raw_payload)
      VALUES (${input.id}, ${input.submissionId}, ${input.changeRequestId}, ${input.outcome}, ${input.message}, ${input.externalReference}, ${input.rawPayload})
    `;
    console.log(
      `[db] Saved FactSet feedback ${input.id} for change ${input.changeRequestId}`,
    );
  } catch (error) {
    console.error("[db] Failed to save FactSet feedback:", error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Update the `fields` JSONB column on a change request.
 *
 * This stores/updates the generic change-type field values, including
 * the IST values that track current (ist) vs target (soll) state.
 */
export async function updateChangeRequestFields(
  changeRequestId: string,
  fields: import("@/lib/types").ChangeFieldValue[],
): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  try {
    await sql`
      UPDATE change_requests
      SET fields = ${JSON.stringify(fields)}::jsonb
      WHERE id = ${changeRequestId}
    `;
    console.log(
      `[db] Updated ${fields.length} field(s) for change request ${changeRequestId}`,
    );
  } catch (error) {
    console.error(
      `[db] Failed to update fields for change request ${changeRequestId}:`,
      error instanceof Error ? error.message : error,
    );
    throw error;
  }
}

// ── Webhook Config Functions ─────────────────────────────────────────────────

export async function getWebhookConfigs(): Promise<WebhookConfig[]> {
  if (!sql) return [];
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_configs (
        id text PRIMARY KEY, name text NOT NULL, url text NOT NULL,
        secret text, events jsonb NOT NULL DEFAULT '[]'::jsonb,
        active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const rows = await sql`SELECT * FROM webhook_configs WHERE active = true ORDER BY name`;
    return rows.map((row: any) => ({
      id: String(row.id), name: String(row.name), url: String(row.url),
      secret: row.secret ? String(row.secret) : null,
      events: Array.isArray(row.events) ? row.events : [],
      active: Boolean(row.active),
      createdAt: String(row.created_at),
    }));
  } catch { return []; }
}

export async function saveWebhookConfig(input: {
  id: string; name: string; url: string; secret?: string | null; events?: string[] | null; active?: boolean;
}): Promise<void> {
  if (!sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_configs (
        id text PRIMARY KEY, name text NOT NULL, url text NOT NULL,
        secret text, events jsonb NOT NULL DEFAULT '[]'::jsonb,
        active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO webhook_configs (id, name, url, secret, events, active)
      VALUES (${input.id}, ${input.name}, ${input.url}, ${input.secret ?? null}, ${JSON.stringify(input.events ?? [])}::jsonb, ${input.active ?? true})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, secret = EXCLUDED.secret, events = EXCLUDED.events, active = EXCLUDED.active
    `;
  } catch (error) {
    console.error("[db] Failed to save webhook config:", error);
    throw error;
  }
}

export async function deleteWebhookConfig(id: string): Promise<void> {
  if (!sql) return;
  try { await sql`DELETE FROM webhook_configs WHERE id = ${id}`; }
  catch (error) { console.error("[db] Failed to delete webhook config:", error); throw error; }
}

export async function dispatchWebhooks(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!sql) return;
  try {
    const webhooks = await sql`
      SELECT * FROM webhook_configs WHERE active = true AND events @> ${JSON.stringify([event])}::jsonb
    `;
    for (const wh of webhooks) {
      fetch(String(wh.url), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
      }).catch(() => {});
    }
  } catch { /* best-effort */ }
}

// ── Client/Portfolio Import ──────────────────────────────────────────────────

export async function upsertClientsPortfolios(
  rows: Array<{ clientName: string; clientReference: string; portfolioName: string; portfolioReference: string; benchmarkCode: string }>,
): Promise<{ clientsCreated: number; portfoliosCreated: number; errors: string[] }> {
  const errors: string[] = [];
  const seenClients = new Set<string>();
  const seenPortfolios = new Set<string>();
  let clientsCreated = 0, portfoliosCreated = 0;
  if (!sql) return { clientsCreated: 0, portfoliosCreated: 0, errors: ["Database not available"] };
  for (const row of rows) {
    try {
      if (!seenClients.has(row.clientReference)) {
        seenClients.add(row.clientReference);
        try {
          await sql`
            INSERT INTO clients (id, name, external_reference)
            VALUES (${crypto.randomUUID()}, ${row.clientName}, ${row.clientReference})
            ON CONFLICT (external_reference) DO UPDATE SET name = EXCLUDED.name
          `;
          clientsCreated++;
        } catch { /* already exists */ }
      }
      const clientRows = await sql`SELECT id FROM clients WHERE external_reference = ${row.clientReference} LIMIT 1`;
      if (clientRows.length === 0) { errors.push(`Client not found: ${row.clientReference}`); continue; }
      const clientId = String(clientRows[0].id);
      const benchRows = await sql`SELECT id FROM benchmark_catalog WHERE code = ${row.benchmarkCode} LIMIT 1`;
      if (benchRows.length === 0) { errors.push(`Benchmark not found: ${row.benchmarkCode}`); continue; }
      const benchmarkId = String(benchRows[0].id);
      if (!seenPortfolios.has(row.portfolioReference)) {
        seenPortfolios.add(row.portfolioReference);
        await sql`
          INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id)
          VALUES (${crypto.randomUUID()}, ${clientId}, ${row.portfolioName}, ${row.portfolioReference}, ${benchmarkId})
          ON CONFLICT (client_id, external_reference) DO UPDATE SET name = EXCLUDED.name, current_benchmark_id = EXCLUDED.current_benchmark_id
        `;
        portfoliosCreated++;
      }
    } catch (error) {
      errors.push(`Failed to process row: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { clientsCreated, portfoliosCreated, errors };
}

// ── Helper — create FactSet tables on demand ─────────────────────────────────

async function ensureFactSetTables(sqlClient: any): Promise<void> {
  try {
    await sqlClient`SELECT 1 FROM factset_feedback LIMIT 0`;
  } catch {
    console.log("[db] factset_feedback table missing — creating on demand…");
    await sqlClient.unsafe(`
      CREATE TABLE IF NOT EXISTS factset_feedback (
        id text PRIMARY KEY,
        submission_id text NOT NULL DEFAULT '',
        change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
        outcome text NOT NULL,
        message text NOT NULL DEFAULT '',
        external_reference text,
        raw_payload text NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log("[db] factset_feedback table created on demand.");
  }
}

// ── Generic Change-Type Model — fixtures & fallback ─────────────────────

import type { ChangeField } from "@/lib/types";

const DEFAULT_CHANGE_TYPE_CONFIGS: ChangeTypeConfig[] = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    slug: "benchmark_switch",
    name: "Benchmarkwissel",
    description: "Wijzig de benchmark van een portefeuille naar een andere benchmark",
    category: "benchmark",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "current_benchmark_id", label: "Huidige benchmark (IST)", type: "benchmark", required: true, referenceTable: "benchmark_catalog" },
      { key: "requested_benchmark_id", label: "Gewenste benchmark (SOLL)", type: "benchmark", required: true, referenceTable: "benchmark_catalog" },
    ],
    istSollMapping: [
      { ist: "current_benchmark_id", soll: "requested_benchmark_id", labelIst: "Huidige benchmark (IST)", labelSoll: "Gewenste benchmark (SOLL)" },
    ],
    cost: { baseCost: 0, costCurrency: "EUR", perItemCost: 500, description: "€500 per portefeuille" },
    defaultLeadDays: 7,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
      { id: "factset", name: "FactSet", role: "data_provider", notifyOn: ["on_completion"], mandatory: false, contactType: "webhook" },
    ],
    workflow: "benchmark_switch",
    active: true,
    sortOrder: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    slug: "new_benchmark",
    name: "Nieuwe benchmark",
    description: "Voeg een nieuwe benchmark toe aan de catalogus",
    category: "benchmark",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      {
        key: "asset_class",
        label: "Asset class",
        type: "select",
        required: true,
        options: [
          { value: "Aandelen", label: "Aandelen" },
          { value: "Obligaties", label: "Obligaties" },
          { value: "Vastgoed", label: "Vastgoed" },
          { value: "Alternatieven", label: "Alternatieven" },
          { value: "Liquidity", label: "Liquiditeiten" },
          { value: "Private Equity", label: "Private Equity" },
        ],
      },
      { key: "currency", label: "Valuta", type: "select", required: true, defaultValue: "EUR", options: [{ value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }, { value: "GBP", label: "GBP" }] },
      { key: "long_name", label: "Volledige benchmark naam", type: "text", required: true },
    ],
    istSollMapping: [],
    cost: { baseCost: 5000, costCurrency: "EUR", description: "€5.000 eenmalige kost" },
    defaultLeadDays: 28,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    ],
    workflow: "new_benchmark",
    active: true,
    sortOrder: 20,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    slug: "fee_change",
    name: "Tariefwijziging",
    description: "Wijzig de beheervergoeding voor een portefeuille",
    category: "fee",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "current_fee", label: "Huidig tarief (IST)", type: "currency", required: true },
      { key: "requested_fee", label: "Nieuw tarief (SOLL)", type: "currency", required: true },
      { key: "fee_type", label: "Type tarief", type: "select", required: true, options: [
        { value: "management_fee", label: "Beheervergoeding" },
        { value: "performance_fee", label: "Prestatievergoeding" },
        { value: "fixed_fee", label: "Vast tarief" },
      ]},
      { key: "effective_date", label: "Ingangsdatum", type: "date", required: true },
      { key: "rationale", label: "Reden wijziging", type: "longtext", required: true },
    ],
    istSollMapping: [
      { ist: "current_fee", soll: "requested_fee", labelIst: "Huidig tarief (IST)", labelSoll: "Nieuw tarief (SOLL)" },
    ],
    cost: { baseCost: 250, costCurrency: "EUR", description: "€250 vaste kost" },
    defaultLeadDays: 10,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
      { id: "factset", name: "FactSet", role: "data_provider", notifyOn: ["on_completion"], mandatory: false, contactType: "webhook" },
    ],
    workflow: "fee_change",
    active: true,
    sortOrder: 30,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    slug: "mandate_change",
    name: "Mandaatwijziging",
    description: "Wijzig de mandaatvoorwaarden van een portefeuille",
    category: "mandate",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "mandate_type", label: "Type mandaat", type: "select", required: true, options: [
        { value: "discretionary", label: "Discretionair" },
        { value: "advisory", label: "Adviserend" },
        { value: "execution_only", label: "Execution only" },
      ]},
      { key: "current_value", label: "Huidige waarde", type: "text", required: true },
      { key: "requested_value", label: "Gewenste waarde", type: "text", required: true },
    ],
    istSollMapping: [],
    cost: { baseCost: 350, costCurrency: "EUR", description: "€350 vaste kost" },
    defaultLeadDays: 14,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    ],
    workflow: "mandate_change",
    active: true,
    sortOrder: 40,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    slug: "custodian_change",
    name: "Custodianwijziging",
    description: "Wijzig de custodian van een portefeuille",
    category: "custodian",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "current_custodian_id", label: "Huidige custodian (IST)", type: "select", required: true, options: [
        { value: "custodian_a", label: "Custodian A" },
        { value: "custodian_b", label: "Custodian B" },
        { value: "custodian_c", label: "Custodian C" },
      ]},
      { key: "requested_custodian_id", label: "Nieuwe custodian (SOLL)", type: "select", required: true, options: [
        { value: "custodian_a", label: "Custodian A" },
        { value: "custodian_b", label: "Custodian B" },
        { value: "custodian_c", label: "Custodian C" },
      ]},
      { key: "effective_date", label: "Ingangsdatum", type: "date", required: true },
    ],
    istSollMapping: [
      { ist: "current_custodian_id", soll: "requested_custodian_id", labelIst: "Huidige custodian (IST)", labelSoll: "Nieuwe custodian (SOLL)" },
    ],
    cost: { baseCost: 200, costCurrency: "EUR", description: "€200 vaste kost" },
    defaultLeadDays: 21,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    ],
    workflow: "custodian_change",
    active: true,
    sortOrder: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a0000000-0000-0000-0000-000000000006",
    slug: "rebalance_trigger",
    name: "Herbalanceringsdrempel",
    description: "Stel een herbalanceringsdrempel of -frequentie in",
    category: "rebalance",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "trigger_threshold", label: "Drempelwaarde (%)", type: "number", required: true, min: 0, max: 100 },
      { key: "rebalance_frequency", label: "Herbalanceringsfrequentie", type: "select", required: true, options: [{ value: "monthly", label: "Maandelijks" }, { value: "quarterly", label: "Kwartaal" }, { value: "annually", label: "Jaarlijks" }] },
    ],
    istSollMapping: [],
    cost: { baseCost: 150, costCurrency: "EUR", description: "€150 vaste kost" },
    defaultLeadDays: 5,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    ],
    workflow: "rebalance_trigger",
    active: true,
    sortOrder: 60,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * Get all change type configs.
 * Returns default fixture data when no DATABASE_URL is set,
 * otherwise queries the change_type_config table.
 */
export async function getChangeTypes(): Promise<ChangeTypeConfig[]> {
  if (!sql) return DEFAULT_CHANGE_TYPE_CONFIGS;
  try {
    const rows = await sql`SELECT * FROM change_type_config ORDER BY sort_order ASC`;
    return rows.map(mapRowToChangeTypeConfig);
  } catch {
    return DEFAULT_CHANGE_TYPE_CONFIGS;
  }
}

/**
 * Get a single change type config by slug.
 * Returns null when no DATABASE_URL is set and the slug doesn't match a default.
 */
export async function getChangeTypeBySlug(slug: string): Promise<ChangeTypeConfig | null> {
  if (!sql) return DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === slug) ?? null;
  try {
    const [row] = await sql`SELECT * FROM change_type_config WHERE slug = ${slug} LIMIT 1`;
    return row ? mapRowToChangeTypeConfig(row) : null;
  } catch {
    return DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === slug) ?? null;
  }
}

/**
 * Seed the change_type_config table with default types.
 * Used when the table is first created.
 */
export async function seedChangeTypeConfigs(sqlClient: any): Promise<void> {
  for (const cfg of DEFAULT_CHANGE_TYPE_CONFIGS) {
    try {
      await sqlClient`
        INSERT INTO change_type_config (id, slug, name, description, category, fields, ist_soll_mapping, cost, default_lead_days, stakeholders, workflow, active, sort_order, created_at, updated_at)
        VALUES (
          ${cfg.id}, ${cfg.slug}, ${cfg.name}, ${cfg.description}, ${cfg.category},
          ${JSON.stringify(cfg.fields)}::jsonb,
          ${cfg.istSollMapping ? JSON.stringify(cfg.istSollMapping) : null}::jsonb,
          ${JSON.stringify(cfg.cost)}::jsonb,
          ${cfg.defaultLeadDays},
          ${JSON.stringify(cfg.stakeholders)}::jsonb,
          ${cfg.workflow}, ${cfg.active}, ${cfg.sortOrder},
          ${cfg.createdAt}, ${cfg.updatedAt}
        )
        ON CONFLICT (slug) DO NOTHING
      `;
    } catch {
      // Individual seeding failures are non-fatal
    }
  }
}




function mapRowToChangeTypeConfig(row: Record<string, unknown>): ChangeTypeConfig {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description),
    category: String(row.category),
    fields: JSON.parse(String(row.fields)),
    istSollMapping: row.ist_soll_mapping ? JSON.parse(String(row.ist_soll_mapping)) : undefined,
    cost: JSON.parse(String(row.cost)),
    defaultLeadDays: Number(row.default_lead_days),
    stakeholders: JSON.parse(String(row.stakeholders)),
    workflow: String(row.workflow),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
