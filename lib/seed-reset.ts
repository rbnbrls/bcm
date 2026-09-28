import postgres from "postgres";

export type SeedResetSummary = {
  truncatedTables: string[];
  clientConfigSeed: unknown;
};

const RESET_TABLES: Array<{ schema?: string; table: string }> = [
  { schema: "client_config", table: "admin_audit_log" },
  { schema: "client_config", table: "client_onboarding_staging" },
  { schema: "client_config", table: "change_portfolio_metadata_request" },
  { schema: "client_config", table: "change_lookup_request" },
  { schema: "client_config", table: "change_portfolio_configuration" },
  { schema: "client_config", table: "portfolio_configuration" },
  { schema: "client_config", table: "account" },
  { schema: "client_config", table: "portfolio" },
  { schema: "client_config", table: "parent_account" },
  { schema: "client_config", table: "client" },
  { schema: "client_config", table: "sub_asset_class" },
  { schema: "client_config", table: "asset_class" },
  { schema: "client_config", table: "manager" },
  { schema: "client_config", table: "benchmark" },
  { schema: "client_config", table: "npc_classification" },
  { table: "factset_feedback" },
  { table: "factset_submissions" },
  { table: "notification_log" },
  { table: "status_history" },
  { table: "approvals" },
  { table: "audit_log" },
  { table: "new_benchmark_requests" },
  { table: "change_request_items" },
  { table: "change_requests" },
  { table: "portfolios" },
  { table: "clients" },
  { table: "benchmark_catalog" },
  { table: "wtp_classifications" },
];

function tableRegclassName(input: { schema?: string; table: string }): string {
  return input.schema ? `${input.schema}.${input.table}` : `public.${input.table}`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function qualifiedTableName(input: { schema?: string; table: string }): string {
  return input.schema
    ? `${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)}`
    : quoteIdentifier(input.table);
}

async function callSeedRoute(path: string): Promise<unknown> {
  const headers = new Headers();
  if (process.env.SEED_API_KEY) {
    headers.set("x-api-key", process.env.SEED_API_KEY);
  }

  const request = new Request(`https://bcm.local${path}`, {
    method: "POST",
    headers,
  });

  const route = await import("@/app/api/seed/client-config/route");
  const response = await route.POST(request);
  const body = await response.json();
  if (!response.ok || body?.success === false) {
    const message = typeof body?.error === "string"
      ? body.error
      : `Seed route ${path} failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export async function resetSeedData(): Promise<SeedResetSummary> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL ontbreekt; reset seed data is alleen beschikbaar met een database.");
  }

  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });
  const truncatedTables: string[] = [];
  try {
    for (const table of RESET_TABLES) {
      const [{ exists }] = await sql`
        SELECT to_regclass(${tableRegclassName(table)}) IS NOT NULL AS exists
      `;
      if (!exists) continue;
      await sql.unsafe(`TRUNCATE TABLE ${qualifiedTableName(table)} RESTART IDENTITY CASCADE`);
      truncatedTables.push(tableRegclassName(table));
    }
  } finally {
    await sql.end();
  }

  const clientConfigSeed = await callSeedRoute("/api/seed/client-config");

  return {
    truncatedTables,
    clientConfigSeed,
  };
}
