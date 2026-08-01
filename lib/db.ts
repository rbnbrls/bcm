import { randomUUID } from "crypto";
import postgres from "postgres";
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";
import type { AuditLogEntry, Approval, AssetClass, Benchmark, ChangeRequest, ChangeRequestSummary, ClientConfig, ChangeStatus, ReportFilters, StatusHistoryEntry, WebhookConfig, ChangeFieldValue, StakeholderAssignment, ChangeTypeConfig, FlowStep, Portfolio, WtpClassification, AssetClassRow, Manager, BenchmarkGroup } from "@/lib/types";
import { CHANGE_STATUS_LABELS, computeSlaStatus } from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";

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
export const sql = connectionString ? postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 5, max_lifetime: 300 }) : null;

function mapBenchmark(row: Record<string, unknown>): Benchmark {
  return {
    id: String(row.id), code: String(row.code), name: String(row.name),
    assetClass: String(row.asset_class), currency: String(row.currency),
    cost: typeof row.cost === 'number' ? row.cost : Number(row.cost ?? 1000),
    provider: String(row.provider ?? 'rimes'),
  };
}

/**
 * Resolve SLA status from a database row, preferring cached columns when available.
 * Falls back to computeSlaStatus() for rows where sla_status/sla_days_open are NULL
 * (pre-migration data). This eliminates 500+ Date computations per request and
 * ensures pagination stability within a single request.
 */
function resolveSlaStatus(row: any): { daysOpen: number; slaStatus: import("@/lib/types").SlaStatus } {
  if (row.sla_status != null && row.sla_days_open != null) {
    return {
      daysOpen: Number(row.sla_days_open),
      slaStatus: String(row.sla_status) as import("@/lib/types").SlaStatus,
    };
  }
  return computeSlaStatus(
    String(row.created_at),
    row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1,
    String(row.status)
  );
}

export async function getBenchmarks(): Promise<Benchmark[]> {
  if (!sql) return benchmarks;
  return withTableEnsure(async () => {
    const rows = await sql`SELECT id, code, name, asset_class, currency, cost, provider FROM benchmark_catalog WHERE active = true OR active IS NULL ORDER BY asset_class, name`;
    return rows.map(mapBenchmark);
  }, []);
}

export type BenchmarkNameResult = { name: string; code: string } | null;

/**
 * Retrieve a benchmark's human-readable name and code by its UUID.
 * Queries the benchmark_catalog table. Falls back to demo fixtures when
 * the database is unavailable.
 *
 * @param id - A valid benchmark UUID (e.g. "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1")
 * @returns { name, code } if found, or null if the ID does not exist
 */
export async function getBenchmarkNameById(id: string): Promise<BenchmarkNameResult> {
  if (!sql) {
    // Demo mode: search fixture data
    const found = benchmarks.find((b) => b.id === id);
    return found ? { name: found.name, code: found.code } : null;
  }
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT name, code FROM benchmark_catalog
      WHERE id = ${id} AND (active = true OR active IS NULL)
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return { name: String(rows[0].name), code: String(rows[0].code) };
  }, null);
}

export async function getClientConfigs(): Promise<ClientConfig[]> {
  if (!sql) return demoClientConfigs;
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT c.id AS client_id, c.name AS client_name, c.external_reference AS client_reference, c.regeling_type AS client_regeling_type, c.asset_class AS client_asset_class,
        p.id AS portfolio_id, p.name AS portfolio_name, p.external_reference AS portfolio_reference,
        p.wtp_classification_id, p.asset_class_id, p.manager_id, p.benchmark_id,
        p.asset_class, p.sub_asset_class,
        b.id, b.code, b.name, b.asset_class, b.currency,
        wtp.id AS wtp_id, wtp.name AS wtp_name,
        ac.asset_class_id AS ac_id, ac.asset_class_name AS ac_name,
        m.id AS m_id, m.name AS m_name,
        bg.id AS bg_id, bg.name AS bg_name
      FROM clients c
      LEFT JOIN portfolios p ON p.client_id = c.id AND p.active = true
      LEFT JOIN benchmark_catalog b ON b.id = p.current_benchmark_id
      LEFT JOIN wtp_classifications wtp ON wtp.id = p.wtp_classification_id
      LEFT JOIN client_config.asset_class ac ON ac.asset_class_id::text = p.asset_class_id::text
      LEFT JOIN managers m ON m.id = p.manager_id
      LEFT JOIN benchmarks bg ON bg.id = p.benchmark_id
      WHERE c.status = 'active'
      ORDER BY c.name, p.name`;
    const byClient = new Map<string, ClientConfig>();
    for (const row of rows) {
      const clientId = String(row.client_id);
      const client = byClient.get(clientId) ?? {
        id: clientId,
        name: String(row.client_name),
        externalReference: String(row.client_reference),
        regelingType: row.client_regeling_type ? String(row.client_regeling_type) : undefined,
        assetClass: row.client_asset_class ? String(row.client_asset_class) as AssetClass : undefined,
        portfolios: [],
      };
      if (row.portfolio_id) {
        client.portfolios.push({
          id: String(row.portfolio_id), name: String(row.portfolio_name), externalReference: String(row.portfolio_reference),
          currentBenchmarkId: String(row.id), currentBenchmark: mapBenchmark(row),
          wtpClassificationId: String(row.wtp_classification_id),
          wtpClassification: { id: String(row.wtp_id), name: String(row.wtp_name) },
          assetClassId: String(row.asset_class_id),
          assetClassRow: { id: String(row.ac_id), name: String(row.ac_name) },
          assetClass: row.asset_class ? String(row.asset_class) : "",
          subAssetClass: row.sub_asset_class ? String(row.sub_asset_class) : "",
          managerId: String(row.manager_id),
          manager: { id: String(row.m_id), name: String(row.m_name) },
          benchmarkId: String(row.benchmark_id),
          benchmarkGroup: { id: String(row.bg_id), name: String(row.bg_name) },
        });
      }
      byClient.set(clientId, client);
    }
    return [...byClient.values()];
  }, []);
}

/**
 * Retrieve a single portfolio by its UUID, including its current benchmark.
 * Falls back to demo fixtures when the database is unavailable.
 */
export async function getPortfolioById(id: string): Promise<Portfolio | null> {
  if (!sql) {
    // Fallback: search demo fixtures
    for (const client of demoClientConfigs) {
      const found = client.portfolios.find((p) => p.id === id);
      if (found) return found;
    }
    return null;
  }
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT p.id, p.name, p.external_reference,
        p.wtp_classification_id, p.asset_class_id, p.manager_id, p.benchmark_id,
        p.asset_class, p.sub_asset_class,
        b.id AS benchmark_id, b.code, b.name AS benchmark_name,
        b.asset_class, b.currency, b.cost, b.provider,
        wtp.id AS wtp_id, wtp.name AS wtp_name,
        ac.asset_class_id AS ac_id, ac.asset_class_name AS ac_name,
        m.id AS m_id, m.name AS m_name,
        bg.id AS bg_id, bg.name AS bg_name
      FROM portfolios p
      LEFT JOIN benchmark_catalog b ON b.id = p.current_benchmark_id
      LEFT JOIN wtp_classifications wtp ON wtp.id = p.wtp_classification_id
      LEFT JOIN client_config.asset_class ac ON ac.asset_class_id::text = p.asset_class_id::text
      LEFT JOIN managers m ON m.id = p.manager_id
      LEFT JOIN benchmarks bg ON bg.id = p.benchmark_id
      WHERE p.id = ${id}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: String(row.id),
      name: String(row.name),
      externalReference: String(row.external_reference),
      currentBenchmarkId: String(row.benchmark_id),
      currentBenchmark: {
        id: String(row.benchmark_id),
        code: String(row.code),
        name: String(row.benchmark_name),
        assetClass: String(row.asset_class),
        currency: String(row.currency),
        cost: Number(row.cost ?? 1000),
        provider: String(row.provider ?? 'rimes'),
      },
      wtpClassificationId: String(row.wtp_classification_id),
      wtpClassification: { id: String(row.wtp_id), name: String(row.wtp_name) },
      assetClassId: String(row.asset_class_id),
      assetClassRow: { id: String(row.ac_id), name: String(row.ac_name) },
      assetClass: row.asset_class ? String(row.asset_class) : "",
      subAssetClass: row.sub_asset_class ? String(row.sub_asset_class) : "",
      managerId: String(row.manager_id),
      manager: { id: String(row.m_id), name: String(row.m_name) },
      benchmarkId: String(row.benchmark_id),
      benchmarkGroup: { id: String(row.bg_id), name: String(row.bg_name) },
    };
  }, null);
}

/**
 * Retrieve all portfolios belonging to a client, including each portfolio's
 * current benchmark. Falls back to demo fixtures when the database is
 * unavailable.
 */
export async function getPortfoliosByClientId(clientId: string): Promise<Portfolio[]> {
  if (!sql) {
    // Fallback: search demo fixtures
    const client = demoClientConfigs.find((c) => c.id === clientId);
    return client?.portfolios ?? [];
  }
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT p.id, p.name, p.external_reference,
        p.wtp_classification_id, p.asset_class_id, p.manager_id, p.benchmark_id,
        p.asset_class, p.sub_asset_class,
        b.id AS benchmark_id, b.code, b.name AS benchmark_name,
        b.asset_class, b.currency, b.cost, b.provider,
        wtp.id AS wtp_id, wtp.name AS wtp_name,
        ac.asset_class_id AS ac_id, ac.asset_class_name AS ac_name,
        m.id AS m_id, m.name AS m_name,
        bg.id AS bg_id, bg.name AS bg_name
      FROM portfolios p
      LEFT JOIN benchmark_catalog b ON b.id = p.current_benchmark_id
      LEFT JOIN wtp_classifications wtp ON wtp.id = p.wtp_classification_id
      LEFT JOIN client_config.asset_class ac ON ac.asset_class_id::text = p.asset_class_id::text
      LEFT JOIN managers m ON m.id = p.manager_id
      LEFT JOIN benchmarks bg ON bg.id = p.benchmark_id
      WHERE p.client_id = ${clientId} AND (p.active = true OR p.active IS NULL)
      ORDER BY p.name
    `;
    return rows.map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      externalReference: String(row.external_reference),
      currentBenchmarkId: String(row.benchmark_id),
      currentBenchmark: {
        id: String(row.benchmark_id),
        code: String(row.code),
        name: String(row.benchmark_name),
        assetClass: String(row.asset_class),
        currency: String(row.currency),
        cost: Number(row.cost ?? 1000),
        provider: String(row.provider ?? 'rimes'),
      },
      wtpClassificationId: String(row.wtp_classification_id),
      wtpClassification: { id: String(row.wtp_id), name: String(row.wtp_name) },
      assetClassId: String(row.asset_class_id),
      assetClassRow: { id: String(row.ac_id), name: String(row.ac_name) },
      assetClass: row.asset_class ? String(row.asset_class) : "",
      subAssetClass: row.sub_asset_class ? String(row.sub_asset_class) : "",
      managerId: String(row.manager_id),
      manager: { id: String(row.m_id), name: String(row.m_name) },
      benchmarkId: String(row.benchmark_id),
      benchmarkGroup: { id: String(row.bg_id), name: String(row.bg_name) },
    }));
  }, []);
}

/**
 * Retrieve a single client by its UUID, including its name and reference.
 * Returns null if the client does not exist or is not active.
 * Falls back to demo fixtures when the database is unavailable.
 */
export async function getClientById(clientId: string): Promise<{ id: string; name: string; externalReference: string; assetClass?: string } | null> {
  if (!sql) {
    const client = demoClientConfigs.find((c) => c.id === clientId);
    return client
      ? { id: client.id, name: client.name, externalReference: client.externalReference, assetClass: client.assetClass }
      : null;
  }
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT id, name, external_reference, asset_class
      FROM clients
      WHERE id = ${clientId} AND status = 'active'
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: String(rows[0].id),
      name: String(rows[0].name),
      externalReference: String(rows[0].external_reference),
      assetClass: rows[0].asset_class ? String(rows[0].asset_class) as AssetClass : undefined,
    };
  }, null);
}

// ── Portfolio attribute lookup helpers ─────────────────────────────────

/**
 * Returns all WTP classifications from the database (or demo fixtures).
 */
export async function getWtpClassifications(): Promise<WtpClassification[]> {
  if (!sql) return (await import("@/lib/fixtures")).wtpClassifications;
  return withTableEnsure(async () => {
    const rows = await sql`SELECT id, name FROM wtp_classifications ORDER BY name`;
    return rows.map((r: any) => ({ id: String(r.id), name: String(r.name) }));
  }, []);
}

/**
 * Returns all asset class rows from the database (or demo fixtures).
 */
export async function getAssetClassRows(): Promise<AssetClassRow[]> {
  if (!sql) return (await import("@/lib/fixtures")).assetClassRows;
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT asset_class_id AS id, asset_class_name AS name
      FROM client_config.asset_class
      ORDER BY asset_class_name
    `;
    return rows.map((r: any) => ({ id: String(r.id), name: String(r.name) }));
  }, []);
}

/**
 * Returns all managers from the database (or demo fixtures).
 */
export async function getManagers(): Promise<Manager[]> {
  if (!sql) return (await import("@/lib/fixtures")).managers;
  return withTableEnsure(async () => {
    const rows = await sql`SELECT id, name FROM managers ORDER BY name`;
    return rows.map((r: any) => ({ id: String(r.id), name: String(r.name) }));
  }, []);
}

/**
 * Returns all benchmark groups from the database (or demo fixtures).
 */
export async function getBenchmarkGroups(): Promise<BenchmarkGroup[]> {
  if (!sql) return (await import("@/lib/fixtures")).benchmarkGroups;
  return withTableEnsure(async () => {
    const rows = await sql`SELECT id, name FROM benchmarks ORDER BY name`;
    return rows.map((r: any) => ({ id: String(r.id), name: String(r.name) }));
  }, []);
}

// ── Portfolio attribute lookup CRUD ────────────────────────────────────

type LookupTable = "wtp_classifications" | "managers" | "benchmarks";

/** Check if a lookup value is referenced by any active portfolio. */
async function isLookupValueInUse(table: LookupTable, id: string): Promise<boolean> {
  if (!sql) return false;
  const fkColumn = table === "wtp_classifications" ? "wtp_classification_id"
    : table === "managers" ? "manager_id"
    : "benchmark_id";
  const rows = await sql`
    SELECT 1 FROM portfolios WHERE ${sql(fkColumn)} = ${id} LIMIT 1
  `;
  return rows.length > 0;
}

async function createLookupValue(table: LookupTable, name: string): Promise<{ id: string }> {
  if (!sql) throw new Error("Database not available");
  const id = randomUUID();
  await sql`
    INSERT INTO ${sql(table)} (id, name) VALUES (${id}, ${name})
  `;
  return { id };
}

async function updateLookupValue(table: LookupTable, id: string, name: string): Promise<void> {
  if (!sql) throw new Error("Database not available");
  await sql`
    UPDATE ${sql(table)} SET name = ${name} WHERE id = ${id}
  `;
}

async function deleteLookupValue(table: LookupTable, id: string): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const inUse = await isLookupValueInUse(table, id);
  if (inUse) {
    throw new Error("Deze waarde wordt gebruikt door een of meerdere portefeuilles en kan niet worden verwijderd.");
  }
  await sql`
    DELETE FROM ${sql(table)} WHERE id = ${id}
  `;
}

export async function createWtpClassification(name: string): Promise<{ id: string }> {
  return createLookupValue("wtp_classifications", name);
}
export async function updateWtpClassification(id: string, name: string): Promise<void> {
  return updateLookupValue("wtp_classifications", id, name);
}
export async function deleteWtpClassification(id: string): Promise<void> {
  return deleteLookupValue("wtp_classifications", id);
}

export async function createManager(name: string): Promise<{ id: string }> {
  return createLookupValue("managers", name);
}
export async function updateManager(id: string, name: string): Promise<void> {
  return updateLookupValue("managers", id, name);
}
export async function deleteManager(id: string): Promise<void> {
  return deleteLookupValue("managers", id);
}

export async function createBenchmarkGroup(name: string): Promise<{ id: string }> {
  return createLookupValue("benchmarks", name);
}
export async function updateBenchmarkGroup(id: string, name: string): Promise<void> {
  return updateLookupValue("benchmarks", id, name);
}
export async function deleteBenchmarkGroup(id: string): Promise<void> {
  return deleteLookupValue("benchmarks", id);
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
        sla_status text,
        sla_days_open integer,
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
    INSERT INTO benchmark_catalog (id, code, name, asset_class, asset_class_id, currency)
    VALUES (${benchmark.id}, ${benchmark.code}, ${benchmark.name}, ${benchmark.assetClass}, 
      (
        SELECT asset_class_id::text
        FROM client_config.asset_class
        WHERE asset_class_name = ${benchmark.assetClass}
           OR asset_class_code = ${benchmark.assetClass}
        LIMIT 1
      ),
      ${benchmark.currency})
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * Update the asset_class for an existing client.
 * Looks up the client by external reference (used in the admin table).
 * Falls back to fixture data when no database is available.
 */
export async function updateClientAssetClass(externalReference: string, assetClass: string): Promise<void> {
  if (!sql) {
    // Demo mode: update fixture data in memory
    const client = demoClientConfigs.find((c) => c.externalReference === externalReference);
    if (client) {
      (client as any).assetClass = assetClass as AssetClass;
    }
    return;
  }
  // Look up asset_class_id from client_config.asset_class. This is the only
  // asset-class reference data used by the application.
  let assetClassId: string | null = null;
  try {
    const [row] = await sql`
      SELECT asset_class_id
      FROM client_config.asset_class
      WHERE asset_class_code = ${assetClass}
         OR asset_class_name = ${assetClass}
      LIMIT 1
    `;
    if (row) assetClassId = String(row.asset_class_id);
  } catch { /* table may not exist yet */ }
  await sql`
    UPDATE clients SET 
      asset_class = ${assetClass},
      asset_class_id = ${assetClassId}
    WHERE external_reference = ${externalReference}
  `;
}

/**
 * Update a single portfolio attribute FK column by portfolio UUID.
 * Used for inline editing in the admin client config table.
 * column must be one of: wtp_classification_id, asset_class_id, manager_id, benchmark_id
 * Falls back to fixture data when no database is available.
 */
export async function updatePortfolioAttribute(
  portfolioId: string,
  column: "wtp_classification_id" | "asset_class_id" | "manager_id" | "benchmark_id",
  valueId: string,
): Promise<void> {
  if (!sql) {
    // Demo mode: update fixture data in memory
    for (const client of demoClientConfigs) {
      const portfolio = client.portfolios.find((p) => p.id === portfolioId);
      if (portfolio) {
        if (column === "wtp_classification_id") {
          portfolio.wtpClassificationId = valueId;
          const lookup = (await import("@/lib/fixtures")).wtpClassifications.find((w) => w.id === valueId);
          if (lookup) portfolio.wtpClassification = lookup;
        } else if (column === "asset_class_id") {
          portfolio.assetClassId = valueId;
          const lookup = (await import("@/lib/fixtures")).assetClassRows.find((a) => a.id === valueId);
          if (lookup) portfolio.assetClassRow = lookup;
        } else if (column === "manager_id") {
          portfolio.managerId = valueId;
          const lookup = (await import("@/lib/fixtures")).managers.find((m) => m.id === valueId);
          if (lookup) portfolio.manager = lookup;
        } else if (column === "benchmark_id") {
          portfolio.benchmarkId = valueId;
          const lookup = (await import("@/lib/fixtures")).benchmarkGroups.find((b) => b.id === valueId);
          if (lookup) portfolio.benchmarkGroup = lookup;
        }
      }
    }
    return;
  }
  await sql.unsafe(`UPDATE portfolios SET ${column} = $1 WHERE id = $2`, [valueId, portfolioId]);
}

/**
 * Update a portfolio's assetClass and/or subAssetClass string fields.
 * Validates the pair before saving (caller should validate; this function
 * is the last line of defence).
 * Falls back to fixture data when no database is available.
 *
 * Either field may be undefined (only the provided fields are updated).
 */
export async function updatePortfolioAssetClassFields(
  portfolioId: string,
  fields: { assetClass?: string; subAssetClass?: string },
): Promise<void> {
  if (!sql) {
    // Demo mode: update fixture data in memory
    for (const client of demoClientConfigs) {
      const portfolio = client.portfolios.find((p) => p.id === portfolioId);
      if (portfolio) {
        if (fields.assetClass !== undefined) portfolio.assetClass = fields.assetClass;
        if (fields.subAssetClass !== undefined) portfolio.subAssetClass = fields.subAssetClass;
      }
    }
    return;
  }
  const setClauses: string[] = [];
  const values: string[] = [];
  let idx = 1;
  if (fields.assetClass !== undefined) {
    setClauses.push(`asset_class = $${idx++}`);
    values.push(fields.assetClass);
  }
  if (fields.subAssetClass !== undefined) {
    setClauses.push(`sub_asset_class = $${idx++}`);
    values.push(fields.subAssetClass);
  }
  if (setClauses.length === 0) return;

  values.push(portfolioId);
  await sql.unsafe(
    `UPDATE portfolios SET ${setClauses.join(", ")} WHERE id = $${idx}`,
    values,
  );
}

/**
 * Insert a new client into the clients table.
 * The default benchmark ID is used for portfolio creation.
 */
export async function insertClient(input: {
  id: string;
  name: string;
  externalReference: string;
  regelingType: string;
  assetClass?: string;
}): Promise<void> {
  if (!sql) {
    // Demo mode: no-op
    return;
  }
  // Look up FK IDs for the new 3NF columns
  let regelingTypeId: string | null = null;
  let assetClassId: string | null = null;
  try {
    if (input.regelingType) {
      const [rt] = await sql`SELECT id FROM regeling_types WHERE name = ${input.regelingType} LIMIT 1`;
      if (rt) regelingTypeId = String(rt.id);
    }
    if (input.assetClass) {
      const [ac] = await sql`
        SELECT asset_class_id
        FROM client_config.asset_class
        WHERE asset_class_code = ${input.assetClass}
           OR asset_class_name = ${input.assetClass}
        LIMIT 1
      `;
      if (ac) assetClassId = String(ac.asset_class_id);
    }
  } catch {
    // Tables may not exist yet — ignore FK lookup failures
  }
  await sql`
    INSERT INTO clients (id, name, external_reference, status, regeling_type, regeling_type_id, asset_class, asset_class_id)
    VALUES (${input.id}, ${input.name}, ${input.externalReference}, 'active', ${input.regelingType}, ${regelingTypeId}, ${input.assetClass ?? null}, ${assetClassId})
    ON CONFLICT (external_reference) DO NOTHING
  `;
}

/**
 * Create portfolios for a new client.
 * Each portfolio gets an auto-generated name and the default benchmark,
 * with an external reference built from the client reference + portfolio number.
 */
export async function createPortfolios(input: {
  clientId: string;
  clientExternalReference: string;
  count: number;
  defaultBenchmarkId: string;
  wtpClassificationId: string;
  assetClassId: string;
  managerId: string;
  benchmarkGroupId: string;
}): Promise<Array<{ id: string; name: string; externalReference: string }>> {
  if (!sql) {
    // Demo mode: return mock portfolios
    return Array.from({ length: input.count }, (_, i) => ({
      id: `demo-${input.clientId}-${i + 1}`,
      name: `Portefeuille ${i + 1}`,
      externalReference: `${input.clientExternalReference}-P${i + 1}`,
    }));
  }

  const portfolios: Array<{ id: string; name: string; externalReference: string }> = [];
  for (let i = 0; i < input.count; i++) {
    const id = randomUUID();
    const name = `Portefeuille ${i + 1}`;
    const externalReference = `${input.clientExternalReference}-P${i + 1}`;
    await sql`
      INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id,
        wtp_classification_id, asset_class_id, manager_id, benchmark_id,
        asset_class, sub_asset_class)
      VALUES (${id}, ${input.clientId}, ${name}, ${externalReference}, ${input.defaultBenchmarkId},
        ${input.wtpClassificationId}, ${input.assetClassId}, ${input.managerId}, ${input.benchmarkGroupId},
        NULL, NULL)
    `;
    portfolios.push({ id, name, externalReference });
  }
  return portfolios;
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

    // ── Validate changeTypeId exists in change_type_config ──
    if (input.changeTypeId) {
      const [typeConfig] =
        await transaction`SELECT 1 FROM change_type_config WHERE id = ${input.changeTypeId} LIMIT 1`;
      if (!typeConfig) {
        throw new Error(
          `Change type config met ID "${input.changeTypeId}" bestaat niet.`,
        );
      }
    }

    const sla = input.slaLeadWeeks ?? (input.changeType === "new_benchmark" ? 4 : 1);
    // Validate normalized config IDs before the DB write so bad IDs surface as a
    // clear user-facing error instead of an unhandled foreign-key/server error.
    if (input.changeTypeId && !(await getChangeTypeById(input.changeTypeId))) {
      throw new Error(`Change type config met ID "${input.changeTypeId}" bestaat niet. Selecteer een geldig type`);
    }
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
      INSERT INTO new_benchmark_requests (id, change_request_id, short_name, long_name, asset_class, asset_class_id, currency)
      VALUES (${input.id}, ${input.changeRequestId}, ${input.shortName}, ${input.longName}, ${input.assetClass}, 
        (
          SELECT asset_class_id::text
          FROM client_config.asset_class
          WHERE asset_class_name = ${input.assetClass}
             OR asset_class_code = ${input.assetClass}
          LIMIT 1
        ), ${input.currency})
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
  await ensureAuditTables(sql).catch((e) =>
    console.error("[db] ensureAuditTables failed in getAuditLogs:", e)
  );
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
  await ensureAuditTables(sql).catch((e) =>
    console.error("[db] ensureAuditTables failed in getApprovals:", e)
  );
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
        cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at,
        cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by,
        cr.notification_sent, cr.submitted_at,
        c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      WHERE c.external_reference = ${clientReference}
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const sla = resolveSlaStatus(row);
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
        cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at,
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
      const sla = resolveSlaStatus(row);
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

/**
 * Check which portfolio IDs have open (non-finalized) change requests.
 * Returns a Set of portfolio IDs that are already part of an active change.
 * Restored in commit 0e8c467 — single canonical source of truth (duplicate removed).
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
  let tableCreated = false;
  try {
    const [row] = await sqlClient`SELECT COUNT(*)::int AS cnt FROM change_type_config`;
    if (Number(row?.cnt ?? 0) > 0) {
      // Table exists with data — still attempt to seed canonical configs.
      // The migration script may have auto-created entries with random UUIDs
      // and mismatched slugs (e.g., 'benchmark-switch' vs 'benchmark_switch'),
      // leaving the canonical ones missing. ON CONFLICT (slug) DO NOTHING
      // in seedChangeTypeConfigs prevents duplicate slugs, so this is safe.
      // We skip the table-created log below.
    }
    // Table exists but is empty — seed it below
  } catch {
    // Table doesn't exist — create it
    console.log("[db] change_type_config table missing — creating on demand…");
    await sqlClient.unsafe(`
      CREATE TABLE IF NOT EXISTS change_type_config (
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
      )
    `);
    tableCreated = true;
  }
  // Always try to seed the default types, even if the table already has data.
  // This ensures canonical UUIDs and slugs exist even when the migration
  // script auto-created entries with gen_random_uuid() / transformed slugs.
  try {
    await seedChangeTypeConfigs(sqlClient);
  } catch (err) {
    console.warn("[db] Could not seed default change types:", err instanceof Error ? err.message : err);
  }
  if (tableCreated) {
    console.log("[db] change_type_config table created and seeded.");
  }
}

/**
 * Execute a database operation with automatic table-ensure retry.
 * On first failure, ensures read tables exist (creates them on demand if missing),
 * then retries the operation once. On second failure, returns `fallback`.
 */
async function withTableEnsure<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  for (const attempt of [1, 2]) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === 1) {
        try {
          await ensureReadTables(sql);
        } catch {
          // ensureReadTables itself failed — nothing more we can do
        }
      } else {
        // Second attempt also failed — log to monitoring
        captureError(error, { endpoint: "db.withTableEnsure", phase: "db_query" });
      }
    }
  }
  return fallback;
}

async function ensureReadTables(sqlClient: any): Promise<void> {
  const REQUIRED_TABLES = ["clients", "benchmark_catalog", "portfolios", "wtp_classifications", "managers", "benchmarks", "change_requests", "change_request_items", "new_benchmark_requests", "change_type_config", "audit_log", "approvals", "status_history", "notification_config", "notification_log", "webhook_configs"];
  const DDL_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS clients (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, external_reference text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS benchmark_catalog (id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, asset_class text NOT NULL, currency text NOT NULL, cost numeric(10,2) NOT NULL DEFAULT 1000.00, provider text NOT NULL DEFAULT 'rimes', active boolean NOT NULL DEFAULT true)`,
    `CREATE TABLE IF NOT EXISTS portfolios (id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE, name text NOT NULL, external_reference text NOT NULL, current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id), currency text NOT NULL DEFAULT 'EUR', active boolean NOT NULL DEFAULT true, UNIQUE (client_id, external_reference))`,
    `CREATE TABLE IF NOT EXISTS wtp_classifications (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS managers (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS benchmarks (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now())`,
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
    `CREATE TABLE IF NOT EXISTS notification_config (
      id uuid PRIMARY KEY,
      stakeholder text NOT NULL,
      channel text NOT NULL CHECK (channel IN ('webhook', 'email')),
      recipient text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      change_request_id uuid REFERENCES change_requests(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
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
    `ALTER TABLE audit_log ALTER COLUMN id TYPE text`,
    `ALTER TABLE approvals ALTER COLUMN id TYPE text`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_lead_weeks integer NOT NULL DEFAULT 1`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now()`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS processed_at date`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS processed_by text`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS validated_at date`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS validated_by text`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS notification_sent boolean NOT NULL DEFAULT false`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS submitted_at timestamptz`,
    // ── Generic change-type model columns ──
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS change_type_id uuid REFERENCES change_type_config(id) ON DELETE SET NULL`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost numeric(10,2)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_cost_currency text NOT NULL DEFAULT 'EUR'`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS estimated_lead_days integer`,
    `ALTER TABLE change_type_config ADD COLUMN IF NOT EXISTS process_flow jsonb NOT NULL DEFAULT '[]'::jsonb`,
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
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS regeling_type text`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS asset_class text`,
    `ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS asset_class text`,
    `ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS sub_asset_class text`,
    // ── SLA status caching columns ──
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_status text`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_days_open integer`,
    // ── 3NF Normalization columns ──
    // New lookup tables (3NF: replaces free-text columns with FK references).
    // Asset-class reference data lives exclusively in client_config.asset_class
    // and client_config.sub_asset_class.
    `CREATE TABLE IF NOT EXISTS regeling_types (
      id uuid PRIMARY KEY, name text NOT NULL UNIQUE, description text,
      created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS stakeholders (
      id uuid PRIMARY KEY, name text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now())`,
    `ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS portfolios_asset_class_id_fkey`,
    `ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS portfolios_sub_asset_class_id_fkey`,
    `ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_asset_class_id_fkey`,
    `ALTER TABLE benchmark_catalog DROP CONSTRAINT IF EXISTS benchmark_catalog_asset_class_id_fkey`,
    `ALTER TABLE new_benchmark_requests DROP CONSTRAINT IF EXISTS new_benchmark_requests_asset_class_id_fkey`,
    `DROP INDEX IF EXISTS idx_sub_ac_asset_class_id`,
    `DROP INDEX IF EXISTS idx_asset_classes_code`,
    // FK columns for clients
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS regeling_type_id uuid REFERENCES regeling_types(id)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS asset_class_id text`,
    `ALTER TABLE clients ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`,
    `ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS asset_class_id text`,
    `ALTER TABLE portfolios ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`,
    // FK column for portfolios
    `ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS sub_asset_class_id text`,
    `ALTER TABLE portfolios ALTER COLUMN sub_asset_class_id TYPE text USING sub_asset_class_id::text`,
    // FK columns for benchmark_catalog and new_benchmark_requests
    `ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS asset_class_id text`,
    `ALTER TABLE benchmark_catalog ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`,
    `ALTER TABLE new_benchmark_requests ADD COLUMN IF NOT EXISTS asset_class_id text`,
    `ALTER TABLE new_benchmark_requests ALTER COLUMN asset_class_id TYPE text USING asset_class_id::text`,
    `DROP TABLE IF EXISTS sub_asset_classes CASCADE`,
    `DROP TABLE IF EXISTS asset_classes CASCADE`,
    // FK columns for notification tables
    `ALTER TABLE notification_config ADD COLUMN IF NOT EXISTS stakeholder_id uuid REFERENCES stakeholders(id)`,
    `ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS stakeholder_id uuid REFERENCES stakeholders(id)`,
    // ── Performance indexes ──
    // Foreign key indexes (Postgres does NOT auto-index FK columns)
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
  for (const ddl of schemaMigrations) {
    try { await sqlClient.unsafe(ddl); } catch { /* column may already exist */ }
  }

  // Create SLA trigger function and trigger (idempotent)
  try {
    await sqlClient.unsafe(`
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
    await sqlClient.unsafe(`DROP TRIGGER IF EXISTS trg_change_requests_sla ON change_requests`);
    await sqlClient.unsafe(`
      CREATE TRIGGER trg_change_requests_sla
        BEFORE INSERT OR UPDATE OF status, created_at, sla_lead_weeks
        ON change_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_sla_status_trigger()
    `);
  } catch { /* function may already exist */ }

  // Backfill sla_status + sla_days_open for existing rows where NULL
  try {
    await sqlClient.unsafe(`
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
  } catch { /* table may not exist yet — ignore */ }
}

export async function getChangeRequest(id: string): Promise<ChangeRequest | null> {
  if (!sql) return null;

  const header: any[] = await withTableEnsure(async () => {
    return await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale, cr.effective_date, cr.status, cr.created_at, cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at, cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by, cr.notification_sent, cr.submitted_at,
        cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments,
        cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days,
        c.id AS client_id, c.name AS client_name, c.external_reference AS client_reference
      FROM change_requests cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ${id}`;
  }, [] as any[]);
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

  // Load staged change_portfolio_configuration rows
  let changePortfolioConfigurations: any[] = [];
  try {
    const { getChangePortfolioConfigurations: loadStagedRows } = await import("./client-config-db");
    changePortfolioConfigurations = await loadStagedRows(id);
  } catch {
    // client-config-db or the table may not exist — return empty
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
  const { daysOpen, slaStatus } = resolveSlaStatus(row);

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
    changePortfolioConfigurations: changePortfolioConfigurations.length > 0 ? changePortfolioConfigurations : undefined,
  };
}

export async function getAllChangeRequests(): Promise<ChangeRequestSummary[]> {
  if (!sql) return [];
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at, cr.submitted_at,
        c.name AS client_name,
        COUNT(ri.id)::int AS item_count
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      LEFT JOIN change_request_items ri ON ri.change_request_id = cr.id
      GROUP BY cr.id, c.name
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const slaWeeks = row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1;
      const { daysOpen, slaStatus } = resolveSlaStatus(row);
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
  }, []);
}

/**
 * Get all change requests with full data fields for reporting purposes.
 * Includes estimated costs, lead days, client info, processed timestamps.
 */
export async function getAllChangeRequestsFull(): Promise<ChangeRequest[]> {
  if (!sql) return [];
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale,
        cr.effective_date, cr.status, cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at,
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
      const sla = resolveSlaStatus(row);
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
  }, []);
}

/**
 * Get change requests filtered by the provided report filters.
 * Uses postgres.js composable SQL fragments to build dynamic WHERE clauses,
 * pushing all filtering to the database instead of fetching all rows
 * and filtering in memory.
 */
export async function getFilteredChangeRequests(
  filters: ReportFilters,
): Promise<ChangeRequest[]> {
  if (!sql) return [];
  try {
    let query = sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale,
        cr.effective_date, cr.status, cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at,
        cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by,
        cr.notification_sent, cr.created_at, cr.submitted_at,
        cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments,
        cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days,
        c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      WHERE 1=1
    `;
    if (filters.clientId) {
      query = sql`${query} AND cr.client_id = ${filters.clientId}`;
    }
    if (filters.status) {
      query = sql`${query} AND cr.status = ${filters.status}`;
    }
    if (filters.changeType) {
      query = sql`${query} AND cr.change_type = ${filters.changeType}`;
    }
    if (filters.dateFrom) {
      query = sql`${query} AND cr.created_at >= ${filters.dateFrom}`;
    }
    if (filters.dateTo) {
      query = sql`${query} AND cr.created_at <= ${filters.dateTo}`;
    }
    query = sql`${query} ORDER BY cr.created_at DESC`;

    const rows = await query;
    return rows.map((row: any) => {
      const sla = resolveSlaStatus(row);
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
      // Retry with same filters — the read tables may not exist yet
      let query = sql`
        SELECT cr.id, cr.reference, cr.change_type, cr.change_type_id, cr.requested_by, cr.rationale,
          cr.effective_date, cr.status, cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at,
          cr.processed_at, cr.processed_by, cr.validated_at, cr.validated_by,
          cr.notification_sent, cr.created_at, cr.submitted_at,
          cr.fields AS generic_fields, cr.stakeholders AS stakeholder_assignments,
          cr.estimated_cost, cr.estimated_cost_currency, cr.estimated_lead_days,
          c.name AS client_name, c.external_reference AS client_reference, c.id AS client_id
        FROM change_requests cr
        JOIN clients c ON c.id = cr.client_id
        WHERE 1=1
      `;
      if (filters.clientId) {
        query = sql`${query} AND cr.client_id = ${filters.clientId}`;
      }
      if (filters.status) {
        query = sql`${query} AND cr.status = ${filters.status}`;
      }
      if (filters.changeType) {
        query = sql`${query} AND cr.change_type = ${filters.changeType}`;
      }
      if (filters.dateFrom) {
        query = sql`${query} AND cr.created_at >= ${filters.dateFrom}`;
      }
      if (filters.dateTo) {
        query = sql`${query} AND cr.created_at <= ${filters.dateTo}`;
      }
      query = sql`${query} ORDER BY cr.created_at DESC`;

      const rows = await query;
      return rows.map((row: any) => {
        const sla = resolveSlaStatus(row);
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

export async function updateChangeStatus(id: string, newStatus: ChangeStatus, userName?: string): Promise<string> {
  if (!sql) throw new Error("Database niet bereikbaar.");
  await (sql as any).begin(async (tx: any) => {
    // Get current status before updating
    const rows = await tx`SELECT status, submitted_at FROM change_requests WHERE id = ${id}`;
    if (rows.length === 0) throw new Error("Change request niet gevonden.");
    const currentStatus = String(rows[0].status);

    // Build SET clauses safely using postgres composable SQL fragments
    let updates = sql`status = ${newStatus}, status_updated_at = now()`;

    // Set submitted_at when transitioning to 'submitted' for the first time
    if (newStatus === 'submitted' && !rows[0].submitted_at) {
      updates = sql`${updates}, submitted_at = now()`;
    }

    if (newStatus === 'processed' && userName) {
      updates = sql`${updates}, processed_at = CURRENT_DATE, processed_by = ${userName}`;
    }
    if (newStatus === 'validated' && userName) {
      updates = sql`${updates}, validated_at = CURRENT_DATE, validated_by = ${userName}`;
    }

    await tx`UPDATE change_requests SET ${updates} WHERE id = ${id}`;

    // Log status transition
    const historyId = crypto.randomUUID();
    await tx`
      INSERT INTO status_history (id, change_request_id, from_status, to_status, changed_by)
      VALUES (${historyId}, ${id}, ${currentStatus}, ${newStatus}, ${userName ?? null})
    `;

    // Trigger type-specific processing when a change is processed
    if (newStatus === 'processed') {
      // Fetch the change type to determine the right processing function
      const [crRow] = await tx`SELECT change_type FROM change_requests WHERE id = ${id}`;
      if (crRow) {
        const changeType = String(crRow.change_type);
        // Delegate to the change-processor, which decides between the
        // 3NF (change_portfolio_configuration) path and the legacy path.
        // Direct mutations of client_config tables are not allowed anywhere
        // else in the codebase — see lib/change-processor.ts.
        const { processChangeForProcessedStatus } = await import("./change-processor");
        await processChangeForProcessedStatus(id, changeType);
      }
    }
  });
  return id;
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
        }).catch((e) => {
          console.error(`[db] IST sync webhook failed for ${changeId}:`, e);
        });
      }
    } catch (err) {
      console.error(`[db] IST sync webhook fetch setup failed for ${changeId}:`, err);
    }
  }
}

/**
 * Create a portfolio from a portfolio_addition change request.
 *
 * Called when the change request reaches 'processed' status.
 * Reads the change request's JSONB fields, validates them, resolves
 * the sub_asset_class_id FK, and INSERTs a new portfolio row.
 */
export async function createPortfolioFromChangeAction(changeRequestId: string): Promise<{ success: boolean; portfolioId?: string; error?: string }> {
  if (!sql) return { success: false, error: "Database niet bereikbaar." };

  try {
    // 1. Fetch the change request and its fields
    const changeRequest = await getChangeRequest(changeRequestId);
    if (!changeRequest) return { success: false, error: "Change request niet gevonden." };
    if (!changeRequest.fields || changeRequest.fields.length === 0) {
      return { success: false, error: "Geen velden gevonden in de change request." };
    }

    // 2. Convert fields array to a flat record (sollValue is the target)
    const fieldValues: Record<string, unknown> = {};
    for (const f of changeRequest.fields) {
      fieldValues[f.fieldKey] = f.sollValue ?? f.istValue;
    }

    // 3. Validate required fields
    const requiredFields = [
      "client_id", "name", "external_reference", "current_benchmark_id",
      "wtp_classification_id", "asset_class_id", "manager_id", "benchmark_id",
      "asset_class", "sub_asset_class",
    ];
    const missing: string[] = [];
    for (const key of requiredFields) {
      const val = fieldValues[key];
      if (val === undefined || val === null || val === "") {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      return { success: false, error: `Verplichte velden ontbreken: ${missing.join(", ")}` };
    }

    // 4. Resolve sub_asset_class_id from the client_config hierarchy
    let subAssetClassId: string | null = null;
    const subAssetClassName = String(fieldValues["sub_asset_class"]).trim();
    if (subAssetClassName) {
      const [sacRow] = await sql`
        SELECT sac.sub_asset_class_id
        FROM client_config.sub_asset_class sac
        JOIN client_config.asset_class ac ON ac.asset_class_id = sac.asset_class_id
        WHERE (sac.sub_asset_class_name = ${subAssetClassName}
            OR sac.sub_asset_class_code = ${subAssetClassName})
          AND ac.asset_class_id::text = ${String(fieldValues["asset_class_id"])}
        LIMIT 1
      `;
      if (sacRow) subAssetClassId = String(sacRow.sub_asset_class_id);
    }

    // 5. Validate FK references exist
    const fkChecks: Array<{ key: string; table: string; label: string }> = [
      { key: "client_id", table: "clients", label: "Cliënt" },
      { key: "current_benchmark_id", table: "benchmark_catalog", label: "Huidige benchmark" },
      { key: "wtp_classification_id", table: "wtp_classifications", label: "WTP classificatie" },
      { key: "manager_id", table: "managers", label: "Manager" },
      { key: "benchmark_id", table: "benchmarks", label: "Benchmark groep" },
    ];
    for (const fk of fkChecks) {
      const val = String(fieldValues[fk.key]);
      const rows = await sql`SELECT 1 FROM ${sql(fk.table)} WHERE id = ${val} LIMIT 1`;
      if (rows.length === 0) {
        return { success: false, error: `${fk.label} met ID "${val}" bestaat niet.` };
      }
    }
    const assetClassId = String(fieldValues["asset_class_id"]);
    const assetClassRows = await sql`
      SELECT 1
      FROM client_config.asset_class
      WHERE asset_class_id::text = ${assetClassId}
      LIMIT 1
    `;
    if (assetClassRows.length === 0) {
      return { success: false, error: `Asset class met ID "${assetClassId}" bestaat niet.` };
    }

    // 6. Validate uniqueness of external_reference per client
    const clientId = String(fieldValues["client_id"]);
    const externalRef = String(fieldValues["external_reference"]).trim();
    const dupRows = await sql`
      SELECT 1 FROM portfolios
      WHERE client_id = ${clientId} AND external_reference = ${externalRef} AND active = true
      LIMIT 1
    `;
    if (dupRows.length > 0) {
      return { success: false, error: `Externe referentie "${externalRef}" bestaat al voor deze cliënt.` };
    }

    // 7. INSERT the new portfolio
    const portfolioId = crypto.randomUUID();
    const currency = String(fieldValues["currency"] || "EUR");
    const name = String(fieldValues["name"]).trim();
    const portfolioAssetClass = String(fieldValues["asset_class"]).trim();

    await sql`
      INSERT INTO portfolios (
        id, client_id, name, external_reference, current_benchmark_id,
        wtp_classification_id, asset_class_id, sub_asset_class_id,
        manager_id, benchmark_id, asset_class, sub_asset_class,
        currency, active
      ) VALUES (
        ${portfolioId}, ${clientId}, ${name}, ${externalRef},
        ${String(fieldValues["current_benchmark_id"])},
        ${String(fieldValues["wtp_classification_id"])},
        ${String(fieldValues["asset_class_id"])},
        ${subAssetClassId},
        ${String(fieldValues["manager_id"])},
        ${String(fieldValues["benchmark_id"])},
        ${portfolioAssetClass},
        ${subAssetClassName},
        ${currency}, true
      )
    `;

    return { success: true, portfolioId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout bij aanmaken portfolio";
    console.error(`[createPortfolioFromChangeAction] Failed for ${changeRequestId}:`, message);
    return { success: false, error: message };
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
  if (!sql) return [];
  return withTableEnsure(async () => {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at, cr.submitted_at,
        c.name AS client_name,
        COUNT(ri.id)::int AS item_count
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      LEFT JOIN change_request_items ri ON ri.change_request_id = cr.id
      WHERE cr.sla_status = ${slaStatus}
      GROUP BY cr.id, c.name
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const slaWeeks = row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1;
      const { daysOpen, slaStatus: status } = resolveSlaStatus(row);
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
        slaStatus: status,
        statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
        itemCount: Number(row.item_count ?? 0),
      };
    });
  }, []);
}

export async function getChangesByStatus(status: string): Promise<ChangeRequestSummary[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT cr.id, cr.reference, cr.change_type, cr.status, cr.created_at, cr.sla_lead_weeks, cr.sla_status, cr.sla_days_open, cr.status_updated_at, cr.submitted_at,
        c.name AS client_name,
        COUNT(ri.id)::int AS item_count
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      LEFT JOIN change_request_items ri ON ri.change_request_id = cr.id
      WHERE cr.status = ${status}
      GROUP BY cr.id, c.name
      ORDER BY cr.created_at DESC
    `;
    return rows.map((row: any) => {
      const slaWeeks = row.sla_lead_weeks != null ? Number(row.sla_lead_weeks) : 1;
      const { daysOpen, slaStatus } = resolveSlaStatus(row);
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

/**
 * Batch fetch notification configs for multiple stakeholders at once.
 * Reduces N+1 query patterns in resolveConfig() from 6 sequential queries
 * to 1 (or 2 with pagination).
 *
 * When changeRequestId is provided, returns both per-change configs
 * (matching the given id) and app-wide configs (change_request_id IS NULL)
 * for all specified stakeholders.
 */
export async function getNotificationConfigsBatch(
  stakeholderIds: string[],
  changeRequestId?: string
): Promise<NotificationConfigRow[]> {
  if (!sql || stakeholderIds.length === 0) return [];
  let query = sql`SELECT * FROM notification_config WHERE stakeholder = ANY(${stakeholderIds})`;
  if (changeRequestId) {
    query = sql`${query} AND (change_request_id = ${changeRequestId} OR change_request_id IS NULL)`;
  } else {
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
    INSERT INTO notification_config (id, stakeholder, stakeholder_id, channel, recipient, is_active, change_request_id)
    VALUES (
      ${input.id},
      ${input.stakeholder},
      (SELECT id FROM stakeholders WHERE name = ${input.stakeholder}),
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
      INSERT INTO notification_log (id, change_request_id, stakeholder, stakeholder_id, channel, recipient, status, attempts, max_attempts, response, next_retry_at)
      VALUES (
        ${logId},
        ${input.changeRequestId},
        ${input.stakeholder},
        (SELECT id FROM stakeholders WHERE name = ${input.stakeholder}),
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
      }).catch((e) => {
        console.error(`[db] Webhook dispatch to ${String(wh.url)} failed:`, e);
      });
    }
  } catch { /* best-effort */ }
}

// ── Client/Portfolio Import ──────────────────────────────────────────────────

export async function upsertClientsPortfolios(
  rows: Array<{ clientName: string; clientReference: string; portfolioName: string; portfolioReference: string; benchmarkCode: string }>,
): Promise<{ clientsCreated: number; portfoliosCreated: number; errors: string[] }> {
  const errors: string[] = [];

  // ── Input validation ─────────────────────────────────────────────────
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Validate required fields are non-empty
    if (!row.clientName?.trim()) { errors.push(`Row ${i + 1}: clientName is required`); continue; }
    if (!row.clientReference?.trim()) { errors.push(`Row ${i + 1}: clientReference is required`); continue; }
    if (!row.portfolioName?.trim()) { errors.push(`Row ${i + 1}: portfolioName is required`); continue; }
    if (!row.portfolioReference?.trim()) { errors.push(`Row ${i + 1}: portfolioReference is required`); continue; }
    if (!row.benchmarkCode?.trim()) { errors.push(`Row ${i + 1}: benchmarkCode is required`); continue; }
  }
  if (errors.length > 0) {
    return { clientsCreated: 0, portfoliosCreated: 0, errors };
  }

  const seenPortfolios = new Set<string>();
  let clientsCreated = 0, portfoliosCreated = 0;
  if (!sql) return { clientsCreated: 0, portfoliosCreated: 0, errors: ["Database not available"] };

  // ── Batch lookups before the loop (reduces N SELECTs to 2 total) ──────
  const allClientRefs = [...new Set(rows.map((r) => r.clientReference))];
  const allBenchmarkCodes = [...new Set(rows.map((r) => r.benchmarkCode))];

  const clientMap = new Map<string, string>();
  if (allClientRefs.length > 0) {
    const existing = await sql`
      SELECT id, external_reference FROM clients
        WHERE external_reference = ANY(${allClientRefs})
    `;
    for (const row of existing) {
      clientMap.set(String(row.external_reference), String(row.id));
    }
  }

  const benchmarkMap = new Map<string, string>();
  if (allBenchmarkCodes.length > 0) {
    const existing = await sql`
      SELECT id, code FROM benchmark_catalog
        WHERE code = ANY(${allBenchmarkCodes})
    `;
    for (const row of existing) {
      benchmarkMap.set(String(row.code), String(row.id));
    }
  }

  for (const row of rows) {
    try {
      // ── Resolve client id (INSERT if new, then cache in map) ──────────
      let clientId = clientMap.get(row.clientReference);
      if (!clientId) {
        try {
          const result = await sql`
            INSERT INTO clients (id, name, external_reference, asset_class)
            VALUES (${crypto.randomUUID()}, ${row.clientName}, ${row.clientReference}, NULL)
            ON CONFLICT (external_reference) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
          `;
          clientId = String(result[0].id);
          clientMap.set(row.clientReference, clientId);
          clientsCreated++;
        } catch { /* already exists (concurrent insert) */ }
      }
      if (!clientId) { errors.push(`Client not found: ${row.clientReference}`); continue; }

      // ── Resolve benchmark id from the pre-fetched map ──────────────────
      const benchmarkId = benchmarkMap.get(row.benchmarkCode);
      if (!benchmarkId) { errors.push(`Benchmark not found: ${row.benchmarkCode}`); continue; }

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

export const DEFAULT_CHANGE_TYPE_CONFIGS: ChangeTypeConfig[] = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    slug: "benchmark_switch",
    name: "Benchmarkwissel",
    description: "Wijzig de benchmark van een portefeuille naar een andere benchmark",
    extendedExplanation: "Een benchmarkwissel wijzigt de referentie-index (benchmark) waartegen een portefeuille wordt beheerd en gemeten. Dit is nodig wanneer de beleggingsstrategie verandert, een benchmark niet langer passend is, of een goedkoper of breder alternatief beschikbaar komt.\n\nHet proces start met een aanvraag door de interne administratie, die de gewenste IST- en SOLL-benchmarks vastlegt. De asset service provider controleert of de nieuwe benchmark past binnen het mandaat en de strategie van de portefeuille, en voert vervolgens de wissel door in de administratie. FactSet verwerkt de wijziging in de datastromen. Na afronding controleert de interne administratie of alles correct is verwerkt en wordt de change gereed gemeld.\n\nLet op: bij een benchmarkwissel kan de portefeuille tijdelijk afwijken van de strategische allocatie. Eventuele herweging vindt plaats na afronding van de wissel.",
    category: "benchmark",
    fields: [
      { key: 'portfolio_id', label: 'Portefeuille', type: 'select', required: true, referenceTable: 'portfolios' },
      { key: 'current_benchmark_id', label: 'Huidige benchmark (IST)', type: 'benchmark', required: true, referenceTable: 'benchmark_catalog', readOnly: true },
      { key: 'requested_benchmark_id', label: 'Gewenste benchmark (SOLL)', type: 'benchmark', required: true, referenceTable: 'benchmark_catalog' },
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
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de benchmarkwissel op en dient de aanvraag in ter goedkeuring." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "Asset service provider controleert de aangevraagde wijziging en accordeert deze." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Uitvoeren benchmarkwissel", leadTime: "2 werkdagen", description: "Asset service provider voert de benchmarkwissel door in de systemen." },
      { stepOrder: 4, stakeholder: "FactSet", stakeholderId: "factset", action: "Verwerken en bevestigen", leadTime: "1 werkdag", description: "FactSet verwerkt de wijziging en stuurt een bevestiging van de verwerking." },
      { stepOrder: 5, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de verwerking en meldt de change gereed." },
    ],
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
    extendedExplanation: "Een nieuwe benchmark aanvraag voegt een nog niet bestaande referentie-index toe aan de benchmarkcatalogus. Dit is relevant wanneer een portefeuille een nieuwe strategie krijgt, een nieuwe asset class wordt toegevoegd, of een specifieke marktindex nog niet in de catalogus is opgenomen.\n\nHet begint met een aanvraag door de interne administratie, die de gewenste benchmarkgegevens vastlegt: naam, asset class en valuta. De asset service provider controleert of de benchmark correct is gespecificeerd en of deze voldoet aan de kwaliteitseisen (voldoende liquiditeit, traceerbare samenstelling, beschikbare data). Na accordering wordt de benchmark toegevoegd aan de catalogus en beschikbaar gesteld voor gebruik in portefeuilles.\n\nDe doorlooptijd is doorgaans langer dan bij een wissel, omdat een nieuwe benchmark eerst moet worden ingericht in de bronsystemen voordat deze in portefeuilles kan worden gebruikt.",
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
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de aanvraag voor een nieuwe benchmark op en dient deze in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "5 werkdagen", description: "Asset service provider controleert de benchmarkgegevens en accordeert de toevoeging." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Toevoegen aan catalogus", leadTime: "10 werkdagen", description: "Asset service provider voegt de nieuwe benchmark toe aan de benchmarkcatalogus." },
      { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de toevoeging en meldt de change gereed." },
    ],
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
    extendedExplanation: "Een tariefwijziging past de beheervergoeding aan die voor een portefeuille in rekening wordt gebracht. Dit kan zowel een verhoging als verlaging zijn van het managementfee, performancefee of een vast tarief.\n\nDe interne administratie dient de wijziging in met opgave van het huidige en gewenste tarief, het type tarief en de ingangsdatum. De asset service provider beoordeelt of het nieuwe tarief marktconform is en past binnen de afspraken met de klant. Na accordering verwerkt FactSet het nieuwe tarief in de systemen, waarna de interne administratie een eindcontrole uitvoert.\n\nTariefwijzigingen hebben altijd een gespecificeerde ingangsdatum. Terugwerkende kracht is alleen mogelijk binnen dezelfde factuurperiode.",
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
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de tariefwijziging op en dient de aanvraag in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "Asset service provider controleert het nieuwe tarief en accordeert de wijziging." },
      { stepOrder: 3, stakeholder: "FactSet", stakeholderId: "factset", action: "Verwerken in systeem", leadTime: "3 werkdagen", description: "FactSet verwerkt het nieuwe tarief in de systemen." },
      { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de verwerking en meldt de change gereed." },
    ],
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
    extendedExplanation: "Een mandaatwijziging past de beheerinstructies van een portefeuille aan. Het mandaat bepaalt de speelruimte waarbinnen de asset manager belegt: discretionair (volledig beheer), adviserend (beleggingsadvies met goedkeuring) of execution only (uitvoering op instructie).\n\nDe interne administratie legt de huidige en gewenste mandaatvorm vast met de bijbehorende waarden. De asset service provider toetst of de nieuwe mandaatvoorwaarden uitvoerbaar zijn binnen de bestaande systemen en wettelijke kaders. Na accordering wordt het mandaat aangepast in de administratie.\n\nEen mandaatwijziging heeft vaak impact op rapportages, stembeleid en liquiditeitsbeheer. Zorg dat alle betrokken partijen tijdig geïnformeerd zijn over de nieuwe kaders.",
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
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de mandaatwijziging op en dient de aanvraag in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "5 werkdagen", description: "Asset service provider controleert de nieuwe mandaatvoorwaarden en accordeert de wijziging." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Uitvoeren mandaatwijziging", leadTime: "5 werkdagen", description: "Asset service provider voert de mandaatwijziging door in de administratie." },
      { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de verwerking en meldt de change gereed." },
    ],
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
    extendedExplanation: "Een custodianwijziging draagt de bewaring van de activa van een portefeuille over van de ene naar de andere custodian. Dit kan nodig zijn bij een nieuwe aanbesteding, wijziging in servicevereisten, of consolidatie van custody-relaties.\n\nDe interne administratie dient de aanvraag in met de huidige en gewenste custodian. De asset service provider controleert of de nieuwe custodian voldoet aan de vereisten en of de overdracht technisch en juridisch haalbaar is. Na accordering wordt de migratie van activa uitgevoerd, inclusief de overdracht van posities, onderliggende stukken en eventueel openstaande trades.\n\nDe doorlooptijd van een custodianwijziging is relatief lang vanwege de benodigde afstemming tussen partijen en de juridische aspecten. Houd rekening met overdrachtskosten en mogelijke tijdelijke onderbrekingen in rapportages.",
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
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de custodianwijziging op en dient de aanvraag in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "5 werkdagen", description: "Asset service provider controleert de nieuwe custodian en accordeert de wijziging." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Uitvoeren custodianwijziging", leadTime: "10 werkdagen", description: "Asset service provider voert de custodianwijziging door in de administratie." },
      { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de verwerking en meldt de change gereed." },
    ],
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
    extendedExplanation: "Een herbalanceringsdrempel bepaalt wanneer een portefeuille automatisch wordt teruggebracht naar de strategische allocatie. Dit kan op basis van een afwijkingspercentage (drempel) of een vaste frequentie (maandelijks, kwartaal, jaarlijks).\n\nDe interne administratie stelt de gewenste drempelwaarde en frequentie in. De asset service provider controleert of de parameters passen bij het risicoprofiel en de strategie van de portefeuille. Na accordering worden de instellingen doorgevoerd in de systemen, waarna de interne administratie een verificatie uitvoert.\n\nEen te krappe drempel leidt tot veel transacties en mogelijk hogere kosten. Een te ruime drempel vergroot het tracking error risico. De meeste portefeuilles hanteren een drempel tussen 2-5%, afhankelijk van de volatiliteit van de onderliggende allocatie.",
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
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de herbalanceringsdrempel in en dient de aanvraag in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "2 werkdagen", description: "Asset service provider controleert de drempelwaarde en accordeert de instelling." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Instellen in systeem", leadTime: "1 werkdag", description: "Asset service provider stelt de drempel/frequentie in in de systemen." },
      { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de instelling en meldt de change gereed." },
    ],
    active: true,
    sortOrder: 60,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a0000000-0000-0000-0000-000000000007",
    slug: "customer_onboarding",
    name: "Nieuwe klant",
    description: "Onboard een nieuwe klant met FPR/SPR regeling en portfolio's",
    extendedExplanation: "Het onboarden van een nieuwe klant is het volledige proces van het inrichten van een nieuwe pensioenklant in de systemen. Dit omvat de registratie van klantgegevens, het aanmaken van portfolio's en het koppelen van de juiste benchmark.\n\nDe interne administratie start het proces door de klantgegevens, het type regeling (FPR of SPR), het aantal portfolio's en de asset class vast te leggen. De asset service provider controleert de gegevens en richt de klant in de systemen in. Het resultaat is een volledig operationele klantomgeving met portfolio's, benchmarks en rapportages.\n\nEen correcte onboarding is essentieel voor foutloze vervolgprocessen zoals benchmarkwissels, tariefwijzigingen en periodieke rapportages. Besteed extra aandacht aan de regeling-type selectie, omdat dit doorwerkt in alle vervolgadministratie.",
    category: "client",
    fields: [
      { key: "customer_name", label: "Klantnaam", type: "text", required: true },
      { key: "external_reference", label: "Extern referentienummer", type: "text", required: true },
      {
        key: "regeling_type",
        label: "Regeling",
        type: "select",
        required: true,
        options: [
          { value: "FPR", label: "FPR (Flexibele Premieregeling)" },
          { value: "SPR", label: "SPR (Solidaire Premieregeling)" },
        ],
      },
      { key: "portfolio_count", label: "Aantal portfolio's", type: "number", required: true, min: 1 },
      {
        key: "asset_class",
        label: "Asset class",
        type: "select",
        required: true,
        options: [
          { value: "CASH", label: "Cash" },
          { value: "ALTERNATIVES", label: "Alternatives" },
          { value: "EQUITIES", label: "Equities" },
          { value: "FIXED_INCOME", label: "Fixed Income" },
          { value: "REAL_ASSETS", label: "Real Assets" },
          { value: "OVERLAY", label: "Overlay" },
          { value: "MULTI_ASSETS", label: "Multi Assets" },
          { value: "IMPACT", label: "Impact" },
          { value: "OPBOUW", label: "Opbouw" },
          { value: "RENDEMENT", label: "Rendement" },
          { value: "RENTE", label: "Rente" },
          { value: "INFLATION", label: "Inflation" },
          { value: "MATCHING", label: "Matching" },
          { value: "COLLATERAL", label: "Collateral" },
          { value: "RESERVE", label: "Reserve" },
        ],
      },
    ],
    istSollMapping: [],
    cost: { baseCost: 0, costCurrency: "EUR", description: "Geen kosten" },
    defaultLeadDays: 1,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    ],
    workflow: "customer_onboarding",
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de klantgegevens, regelingtype en portfolio-informatie op en dient de onboarding-aanvraag in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en valideren", leadTime: "1 werkdag", description: "Asset service provider controleert de klantgegevens, regelingtype en asset class, en valideert de aanvraag." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Inrichten klantomgeving", leadTime: "2 werkdagen", description: "Asset service provider richt de klant in met portfolio's, benchmarks en rapportages in de systemen." },
      { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de inrichting en meldt de onboarding gereed." },
    ],
    active: true,
    sortOrder: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a0000000-0000-0000-0000-000000000008",
    slug: "portfolio_addition",
    name: "Nieuwe portfolio toevoegen",
    description: "Voeg een nieuwe portefeuille toe aan een bestaande cliënt",
    extendedExplanation:
      "Een nieuwe portfolio toevoegen is het proces van het aanmaken van een nieuwe portefeuille voor een bestaande cliënt. Dit omvat het vastleggen van de portefeuilledetails, classificatie, AC/Sub AC en het activeren van de portefeuille.\\n\\nHet proces doorloopt vier stappen. Eerst worden de basisgegevens vastgelegd: cliënt, portefeuillenaam, externe referentie en de initiële benchmark. Daarna worden de classificatiegegevens ingesteld: WTP classificatie, asset class, manager en benchmark groep. In de derde stap wordt de portefeuille-specifieke AC en Sub AC bepaald, met cascading dropdown validatie. Tot slot volgt een controle en activering, waarna de portefeuille zichtbaar is in de cliënt configuratietabel.\\n\\nLet op: de externe referentie moet uniek zijn per cliënt. De AC/Sub AC-combinatie wordt gevalideerd tegen de bestaande hiërarchie.",
    category: "portfolio",
    fields: [
      { key: "client_id", label: "Cliënt", type: "select", required: true, referenceTable: "clients", helpText: "Selecteer de cliënt voor deze portefeuille" },
      { key: "name", label: "Portefeuillenaam", type: "text", required: true, minLength: 2, maxLength: 100, helpText: "Bijv. Rendementsportefeuille" },
      { key: "external_reference", label: "Externe referentie", type: "text", required: true, minLength: 2, maxLength: 50, helpText: "Bijv. HOR-RP. Moet uniek zijn per cliënt." },
      { key: "current_benchmark_id", label: "Huidige benchmark", type: "benchmark", required: true, referenceTable: "benchmark_catalog", helpText: "De initiële benchmark voor deze portefeuille" },
      { key: "currency", label: "Valuta", type: "select", required: false, defaultValue: "EUR", options: [{ value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }], helpText: "Standaard EUR" },
      { key: "wtp_classification_id", label: "WTP classificatie", type: "select", required: true, referenceTable: "clients", helpText: "Rendement / Matching / Opbouw" },
      { key: "asset_class_id", label: "Asset class (Klant AC)", type: "select", required: true, referenceTable: "clients", helpText: "Bijv. Aandelen, Obligaties" },
      { key: "manager_id", label: "Manager", type: "select", required: true, referenceTable: "clients", helpText: "Beheerder van de portefeuille" },
      { key: "benchmark_id", label: "Benchmark groep", type: "select", required: true, referenceTable: "clients", helpText: "Benchmark group assignment" },
      { key: "asset_class", label: "AC (portefeuille)", type: "select", required: true, options: [
        { value: "CASH", label: "Cash" },
        { value: "EQUITIES", label: "Equities" },
        { value: "FIXED_INCOME", label: "Fixed Income" },
        { value: "ALTERNATIVES", label: "Alternatives" },
        { value: "REAL_ASSETS", label: "Real Assets" },
        { value: "MULTI_ASSETS", label: "Multi Assets" },
        { value: "OVERLAY", label: "Overlay" },
        { value: "IMPACT", label: "Impact" },
      ], helpText: "Portfolio-level asset class key" },
      { key: "sub_asset_class", label: "Sub AC", type: "text", required: true, helpText: "Sub-asset-class binnen de gekozen AC. Wordt gevalideerd tegen de AC/Sub AC hierarchy." },
    ],
    istSollMapping: [],
    cost: { baseCost: 500, costCurrency: "EUR", description: "€500 vaste kost voor toevoegen van een portefeuille" },
    defaultLeadDays: 5,
    stakeholders: [
      { id: "portfolio_manager", name: "Portefeuillebeheerder", role: "Portefeuillebeheerder", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "email" },
      { id: "risk_manager", name: "Risk manager", role: "Risk manager", notifyOn: ["on_submit"], mandatory: true, contactType: "email" },
    ],
    workflow: "portfolio_addition",
    processFlow: [
      { stepOrder: 1, stakeholder: "Portefeuillebeheerder", stakeholderId: "portfolio_manager", action: "Portfolio definiëren", leadTime: "1 werkdag", description: "Portfolio definiëren — naam, referentie, benchmark en cliënt vastleggen." },
      { stepOrder: 2, stakeholder: "Portefeuillebeheerder", stakeholderId: "portfolio_manager", action: "Classificatie instellen", leadTime: "1 werkdag", description: "Classificatie instellen — WTP, Asset class (Klant AC), Manager en Benchmark groep." },
      { stepOrder: 3, stakeholder: "Portefeuillebeheerder", stakeholderId: "portfolio_manager", action: "AC en Sub AC bepalen", leadTime: "1 werkdag", description: "AC en Sub AC bepalen met cascading dropdown validatie tegen de bestaande hiërarchie." },
      { stepOrder: 4, stakeholder: "Risk manager", stakeholderId: "risk_manager", action: "Controleren en activeren", leadTime: "2 werkdagen", description: "Controleren, goedkeuren en activeren van de portefeuille in de cliënt configuratie." },
    ],
    active: true,
    sortOrder: 7,
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
    if (row) return mapRowToChangeTypeConfig(row);
    // Fall back to defaults if not found in DB (e.g., pre-seeded DB may not have all types)
    return DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === slug) ?? null;
  } catch {
    return DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === slug) ?? null;
  }
}

/**
 * Get a single change type config by id.
 * Returns null when no DATABASE_URL is set and the id doesn't match a default.
 */
export async function getChangeTypeById(
  id: string,
  strict = false,
): Promise<ChangeTypeConfig | null> {
  if (!sql) return strict ? null : (DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.id === id) ?? null);
  try {
    const [row] = await sql`SELECT * FROM change_type_config WHERE id = ${id} LIMIT 1`;
    if (row) return mapRowToChangeTypeConfig(row);
    // Fall back to defaults if not found in DB (e.g., pre-seeded DB may not have all types)
    if (strict) return null;
    return DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.id === id) ?? null;
  } catch {
    if (strict) return null;
    return DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.id === id) ?? null;
  }
}

export type UpdateChangeTypeConfigInput = {
  id: string;
  active: boolean;
  cost: {
    baseCost: number;
    costCurrency: string;
    perItemCost?: number;
    description: string;
  };
  defaultLeadDays: number;
  sortOrder: number;
};

export type UpdateChangeTypeActiveInput = {
  id: string;
  active: boolean;
};

/**
 * Update operational settings for a change type.
 *
 * This intentionally limits admin edits to the fields that control whether a
 * change can be requested and how cost/lead-time estimates are calculated.
 */
export async function updateChangeTypeConfig(input: UpdateChangeTypeConfigInput): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar");
  await ensureChangeTypeConfigTable(sql);
  const rows = await sql`
    UPDATE change_type_config
    SET
      active = ${input.active},
      cost = ${JSON.stringify(input.cost)}::jsonb,
      default_lead_days = ${input.defaultLeadDays},
      sort_order = ${input.sortOrder},
      updated_at = now()
    WHERE id = ${input.id}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error("Change type bestaat niet.");
  }
}

export async function updateChangeTypeActive(input: UpdateChangeTypeActiveInput): Promise<void> {
  if (!sql) throw new Error("Database niet bereikbaar");
  await ensureChangeTypeConfigTable(sql);
  const rows = await sql`
    UPDATE change_type_config
    SET
      active = ${input.active},
      updated_at = now()
    WHERE id = ${input.id}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error("Change type bestaat niet.");
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
        INSERT INTO change_type_config (id, slug, name, description, extended_explanation, category, fields, ist_soll_mapping, cost, default_lead_days, stakeholders, workflow, process_flow, active, sort_order, created_at, updated_at)
        VALUES (
          ${cfg.id}, ${cfg.slug}, ${cfg.name}, ${cfg.description}, ${cfg.extendedExplanation ?? null},
          ${cfg.category},
          ${JSON.stringify(cfg.fields)}::jsonb,
          ${cfg.istSollMapping ? JSON.stringify(cfg.istSollMapping) : null}::jsonb,
          ${JSON.stringify(cfg.cost)}::jsonb,
          ${cfg.defaultLeadDays},
          ${JSON.stringify(cfg.stakeholders)}::jsonb,
          ${cfg.workflow},
          ${cfg.processFlow ? JSON.stringify(cfg.processFlow) : '[]'}::jsonb,
          ${cfg.active}, ${cfg.sortOrder},
          ${cfg.createdAt}, ${cfg.updatedAt}
        )
        ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
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
    extendedExplanation: row.extended_explanation ? String(row.extended_explanation) : undefined,
    category: String(row.category),
    fields: JSON.parse(String(row.fields)),
    istSollMapping: row.ist_soll_mapping ? JSON.parse(String(row.ist_soll_mapping)) : undefined,
    cost: JSON.parse(String(row.cost)),
    defaultLeadDays: Number(row.default_lead_days),
    stakeholders: JSON.parse(String(row.stakeholders)),
    workflow: String(row.workflow),
    processFlow: row.process_flow ? JSON.parse(String(row.process_flow)) : undefined,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
