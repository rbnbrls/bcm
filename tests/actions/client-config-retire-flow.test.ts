/**
 * Server-action unit tests validating BOTH sides of the retire (DELETE)
 * flow end to end at the unit level (kanban task t_cedf6a27):
 *
 *   STAGING  — deletePortfolioConfigurationAction (the server action behind
 *              the retire modal) validates input and stages a governed
 *              DELETE change request without touching the live table.
 *   PROCESSING — processChangeForProcessedStatus routes the staged retire
 *              change to the 3NF apply path, which marks the target live row
 *              active_ind = false with effective_until = the requested
 *              retirement date, marks the staged row 'applied', and never
 *              inserts a successor row.
 *
 * The DB-backed integration counterpart lives in
 * tests/retire-apply-integration.test.ts (runs against a real PostgreSQL in
 * the CI e2e-db-test job); the staging-shape unit tests live in
 * tests/actions/client-config-retire-staging.test.ts. This file pins the
 * combined action → processor flow with a mocked database so it runs in the
 * plain `npm test` job.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Admin-gate request scope ──────────────────────────────────────────────────────────────────────────────
// The admin actions call requireAdmin() (lib/admin-auth-request.ts) which
// resolves the active role from the bcm_active_role RBAC cookie
// (lib/rbac-request.ts getActiveRole). Simulate an authenticated admin
// request by mocking the cookie store.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "bcm_active_role" ? { name, value: "admin" } : undefined,
  })),
}));

// ── Postgres mock (same pattern as client-config-retire-staging.test.ts) ──
const queryHandlers = new Map<
  string,
  (sql: string, params: unknown[]) => unknown[]
>();
const unmatchedSqlLog: string[] = [];

function onQuery(
  pattern: RegExp,
  handler: (sql: string, params: unknown[]) => unknown[],
) {
  queryHandlers.set(pattern.source, handler);
}
function clearQueryHandlers() {
  queryHandlers.clear();
  unmatchedSqlLog.length = 0;
}

vi.mock("postgres", () => {
  const handlerFn = (strings: unknown, ...values: unknown[]) => {
    if (typeof strings === "string")
      return { type: "ident" as const, value: strings };
    const parts = strings as TemplateStringsArray;
    let reconstructed = parts[0];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (
        v &&
        typeof v === "object" &&
        "type" in (v as any) &&
        (v as any).type === "ident"
      ) {
        reconstructed += (v as any).value;
      } else {
        reconstructed += `$${i + 1}`;
      }
      reconstructed += parts[i + 1];
    }
    const entries = [...queryHandlers.entries()];
    for (const [patternSource, handler] of entries) {
      try {
        const pattern = new RegExp(patternSource, "is");
        if (pattern.test(reconstructed)) {
          return Promise.resolve(handler(reconstructed, values));
        }
      } catch {
        /* skip */
      }
    }
    unmatchedSqlLog.push(reconstructed.substring(0, 200));
    return Promise.resolve([]);
  };
  const sql = Object.assign(handlerFn, {
    begin: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });
  return { default: vi.fn(() => sql) };
});

// ── Mock next/navigation redirect ──────────────────────────────────────────
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("REDIRECT");
  },
}));

const RETIRE_CONFIG = {
  id: "a0000000-0000-0000-0000-000000000014",
  slug: "portfolio_configuration_retire",
  name: "Portefeuilleconfiguratie beëindigen",
  description: "Beëindig (retire) een bestaande portefeuilleconfiguratie",
  category: "portfolio",
  cost: JSON.stringify({ baseCost: 500, costCurrency: "EUR", description: "" }),
  default_lead_days: 5,
  fields: "[]",
  stakeholders: "[]",
  workflow: "portfolio_configuration_retire",
  active: true,
  sort_order: 7,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const FUTURE_DATE = new Date(Date.now() + 30 * 86400000)
  .toISOString()
  .split("T")[0];
const PAST_DATE = new Date(Date.now() - 30 * 86400000)
  .toISOString()
  .split("T")[0];

const TARGET_ID = "ADP*EQACX*ROB";

/** The live (active) row the retire change targets, as returned by
 *  getClientConfigPortfolioConfigurations() / getClientConfigPortfolioConfigurationById(). */
const EXISTING_ROW = {
  primary_account_id: TARGET_ID,
  client_code: "ADP",
  client_name: "ADP",
  portfolio_code: "ADP",
  parent_account_id: 1,
  parent_account_code: "ADP_MAIN",
  asset_class_code: "EQ",
  asset_class_name: "EQUITIES",
  sub_asset_class_code: "ACX",
  sub_asset_class_name: "AC WORLD",
  manager_code: "ROB",
  manager_name: "ROBECO",
  benchmark_code: "MSCI-WORLD-NR",
  benchmark_name: "MSCI World NR",
  npc_classification_id: 1,
  classification_name: "Geen NPC",
  long_name: "E2E Portfolio",
  short_name: "E2E-PF",
  active_ind: true,
  effective_from: "2026-01-01",
  effective_until: null,
  change_request_id: null,
};

function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

function retireFormData(overrides: Record<string, string> = {}): FormData {
  return buildMockFormData({
    primaryAccountId: TARGET_ID,
    requestedBy: "E2E Admin",
    rationale: "Acceptance test — retire this portfolio config.",
    effectiveDate: FUTURE_DATE,
    ...overrides,
  });
}

/** Stub the reads the staging action performs before any write. */
function stubStagingReads() {
  // Active-list + by-id lookups of the live portfolio_configuration table.
  onQuery(/FROM client_config\.portfolio_configuration pc/i, () => [
    EXISTING_ROW,
  ]);
  onQuery(/SELECT \* FROM change_type_config WHERE slug/i, (_sql, params) =>
    String(params[0]) === RETIRE_CONFIG.slug ? [RETIRE_CONFIG] : [],
  );
  // saveChangeRequest verifies the resolved change_type_id exists.
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  onQuery(/SELECT id FROM clients/i, () => [
    { id: "c0000000-0000-0000-0000-000000000001" },
  ]);
  onQuery(/INSERT INTO change_requests/i, () => []);
}

beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});


describe("retire flow — deletePortfolioConfigurationAction staging → processChangeForProcessedStatus apply (mocked DB)", () => {
  it("stages a DELETE change request, then processing closes the live row at the requested retirement date without inserting a successor", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubStagingReads();

    // Capture the staged row's INSERT parameters (column order of
    // saveChangePortfolioConfiguration: change_request_id, action_type,
    // target_primary_account_id, client_code, portfolio_code, asset_class_code,
    // sub_asset_class_code, manager_code, benchmark_code, npc_classification_id,
    // long_name, short_name, effective_from, effective_until).
    let stagedInsert: Record<string, unknown> | null = null;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, (_sql, params) => {
      stagedInsert = {
        changeRequestId: params[0],
        actionType: params[1],
        targetPrimaryAccountId: params[2],
        clientCode: params[3],
        portfolioCode: params[4],
        assetClassCode: params[5],
        subAssetClassCode: params[6],
        managerCode: params[7],
        benchmarkCode: params[8],
        npcClassificationId: params[9],
        longName: params[10],
        shortName: params[11],
        effectiveFrom: params[12],
        effectiveUntil: params[13],
      };
      return [{ id: 1 }];
    });

    // ── PHASE 1: the server action stages the governed DELETE request ──────
    const { deletePortfolioConfigurationAction } = await import(
      "@/app/admin/client-config/actions"
    );
    try {
      await deletePortfolioConfigurationAction({}, retireFormData());
    } catch {
      /* redirect throw */
    }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/changes");

    expect(stagedInsert, "expected a staged change_portfolio_configuration INSERT").not.toBeNull();
    expect(stagedInsert!.actionType).toBe("DELETE");
    expect(stagedInsert!.targetPrimaryAccountId).toBe(TARGET_ID);
    // The requested retirement date is staged in both effective_from (the
    // date the change takes effect) and effective_until (the close-out date).
    expect(stagedInsert!.effectiveFrom).toBe(FUTURE_DATE);
    expect(stagedInsert!.effectiveUntil).toBe(FUTURE_DATE);
    const changeRequestId = String(stagedInsert!.changeRequestId);
    expect(changeRequestId).toMatch(/^[0-9a-f-]{36}$/);

    // ── PHASE 2: processing the staged retire change applies it ────────────
    // The processor re-reads the staged row (snake_case columns), checks the
    // target live row exists, then issues the close-out UPDATE.
    onQuery(
      /FROM client_config\.change_portfolio_configuration\s+WHERE change_request_id/i,
      () => [
        {
          id: 1,
          change_request_id: changeRequestId,
          action_type: "DELETE",
          target_primary_account_id: TARGET_ID,
          client_code: "ADP",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "E2E Portfolio",
          short_name: "E2E-PF",
          effective_from: FUTURE_DATE,
          effective_until: FUTURE_DATE,
          apply_status: null,
          apply_error: null,
        },
      ],
    );
    onQuery(/SELECT 1 FROM client_config\.portfolio_configuration/i, () => [
      { 1: 1 },
    ]);

    let applyUpdate: unknown[] | null = null;
    onQuery(/UPDATE client_config\.portfolio_configuration/i, (_sql, params) => {
      applyUpdate = params;
      return [];
    });
    let stagedStatusUpdate: { sql: string; params: unknown[] } | null = null;
    onQuery(/UPDATE client_config\.change_portfolio_configuration/i, (sqlText, params) => {
      stagedStatusUpdate = { sql: sqlText, params };
      return [];
    });
    // DELETE must NEVER insert a successor row into the live table.
    let liveInsertCount = 0;
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      liveInsertCount++;
      return [];
    });

    const { processChangeForProcessedStatus } = await import(
      "@/lib/change-processor"
    );
    const result = await processChangeForProcessedStatus(
      changeRequestId,
      "portfolio_configuration_retire",
    );

    // Routed to the 3NF apply path, not the legacy processor.
    expect(result.usedLegacy).toBe(false);
    expect(result.applied).toBe(true);
    expect(result.outcomes).toEqual([
      { actionType: "DELETE", primaryAccountId: TARGET_ID, result: "applied" },
    ]);

    // The live row was closed out at the REQUESTED retirement date:
    //   UPDATE client_config.portfolio_configuration
    //   SET active_ind = false, effective_until = ${FUTURE_DATE}
    //   WHERE primary_account_id = ${TARGET_ID} AND active_ind = true
    expect(applyUpdate, "expected the close-out UPDATE of the live row").not.toBeNull();
    expect(applyUpdate![0]).toBe(FUTURE_DATE);
    expect(applyUpdate![1]).toBe(TARGET_ID);

    // The staged row flipped to 'applied' (apply_status literal, row id param).
    expect(stagedStatusUpdate).not.toBeNull();
    expect(stagedStatusUpdate!.sql).toMatch(/apply_status\s*=\s*'applied'/i);
    expect(stagedStatusUpdate!.params[0]).toBe(1);

    // Retire = close-out only: no successor row was inserted.
    expect(liveInsertCount).toBe(0);
  });

  it("rejects a past effective date server-side before staging anything", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubStagingReads();

    let stagedCount = 0;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      stagedCount++;
      return [];
    });

    const { deletePortfolioConfigurationAction } = await import(
      "@/app/admin/client-config/actions"
    );
    const state = await deletePortfolioConfigurationAction(
      {},
      retireFormData({ effectiveDate: PAST_DATE }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("verleden");
    expect(mockRedirect).not.toHaveBeenCalled();
    // No staged row, no change request write — the live table is untouched.
    expect(stagedCount).toBe(0);
  });
});
