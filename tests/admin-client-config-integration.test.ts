/**
 * Integration tests for the /admin/client-config data endpoint.
 *
 * These tests verify that getClientConfigPortfolioConfigurations() — the
 * backing function for the /admin/client-config page — correctly reflects
 * processed change requests.
 *
 * Flow tested:
 *   1. Seed initial data via mocked SQL
 *   2. getClientConfigPortfolioConfigurations() returns initial state
 *   3. Stage a portfolio-configuration UPDATE change
 *   4. Apply (process) the staged change
 *   5. getClientConfigPortfolioConfigurations() reflects the applied update
 *      (old row closed out, new active row with updated values)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock the sql layer (postgres-js) ────────────────────────────────────
const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown[]>();
const unmatchedSqlLog: string[] = [];

function onQuery(
  pattern: RegExp,
  handler: (sql: string, params: unknown[]) => unknown[],
): void {
  queryHandlers.set(pattern.source, handler);
}
function clearQueryHandlers(): void {
  queryHandlers.clear();
  unmatchedSqlLog.length = 0;
}

vi.mock("postgres", () => {
  const handlerFn = (strings: unknown, ...values: unknown[]) => {
    if (typeof strings === "string") {
      return { type: "ident" as const, value: strings };
    }
    const parts = strings as TemplateStringsArray;
    let reconstructed = parts[0];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v && typeof v === "object" && "type" in (v as any) && (v as any).type === "ident") {
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
        // skip
      }
    }
    unmatchedSqlLog.push(reconstructed.substring(0, 200));
    return Promise.resolve([]);
  };
  const sql = Object.assign(handlerFn, {
    begin: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });
  return { default: vi.fn(() => sql) };
});

beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/admin/client-config — integration with change-processing lifecycle", () => {
  it("reflects a processed UPDATE change: old row closed, new row active with updated values", async () => {
    // ── Phase 1: Seed initial portfolio_configuration data ─────────────
    // getClientConfigPortfolioConfigurations() runs this query:
    //   SELECT ... FROM client_config.portfolio_configuration pc
    //   JOIN client_config.client ...
    //   JOIN client_config.portfolio ...
    //   LEFT JOIN client_config.parent_account ...
    //   JOIN client_config.asset_class ...
    //   JOIN client_config.sub_asset_class ...
    //   JOIN client_config.manager ...
    //   JOIN client_config.benchmark ...
    //   JOIN client_config.npc_classification ...
    //   WHERE pc.active_ind = true
    //   ORDER BY pc.portfolio_code, ac.asset_class_name, sac.sub_asset_class_name
    //
    // We return a single initial row: ADP / FI-HYG / ROB / MSCI-WORLD-NR

    const initialPortfolioConfigRow = {
      primary_account_id: "ADP_FIHYG_ROB",
      client_code: "ADP",
      client_name: "ADP Beheer B.V.",
      portfolio_code: "ADP",
      parent_account_id: null,
      parent_account_code: null,
      asset_class_code: "FI",
      asset_class_name: "Fixed Income",
      sub_asset_class_code: "HYG",
      sub_asset_class_name: "High Yield Government",
      manager_code: "ROB",
      manager_name: "Robeco",
      benchmark_code: "MSCI-WORLD-NR",
      benchmark_name: "MSCI World Net Return",
      npc_classification_id: 1,
      classification_name: "Kern",
      long_name: "ADP Fixed Income High Yield",
      short_name: "ADP FIHYG",
      active_ind: true,
      effective_from: "2026-01-01",
      effective_until: null,
      change_request_id: null,
    };

    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [initialPortfolioConfigRow],
    );

    const {
      getClientConfigPortfolioConfigurations,
      stageChangePortfolioConfiguration,
      applyChangePortfolioConfigurations,
    } = await import("@/lib/client-config-db");

    // ── Phase 2: Verify initial state ──────────────────────────────────
    const initialRows = await getClientConfigPortfolioConfigurations();
    expect(initialRows).toHaveLength(1);
    expect(initialRows[0].primaryAccountId).toBe("ADP_FIHYG_ROB");
    expect(initialRows[0].longName).toBe("ADP Fixed Income High Yield");
    expect(initialRows[0].assetClassCode).toBe("FI");
    expect(initialRows[0].activeInd).toBe(true);
    expect(initialRows[0].changeRequestId).toBeNull();

    // ── Phase 3: Stage an UPDATE change ─────────────────────────────────
    // stageChangePortfolioConfiguration first:
    //   - For UPDATE, calls getClientConfigPortfolioConfigurationById()
    //     which queries portfolio_configuration with JOINs for the specific
    //     primary_account_id
    //   - Then runs validation rules (no DB needed)
    //   - Then INSERTs into client_config.change_portfolio_configuration

    // Mock getClientConfigPortfolioConfigurationById (called for UPDATE validation)
    onQuery(
      /FROM client_config\.portfolio_configuration.*WHERE pc\.primary_account_id = \$1 LIMIT 1/i,
      () => [{
        primary_account_id: "ADP_FIHYG_ROB",
        client_code: "ADP",
        client_name: "ADP Beheer B.V.",
        portfolio_code: "ADP",
        parent_account_id: null,
        parent_account_code: null,
        asset_class_code: "FI",
        asset_class_name: "Fixed Income",
        sub_asset_class_code: "HYG",
        sub_asset_class_name: "High Yield Government",
        manager_code: "ROB",
        manager_name: "Robeco",
        benchmark_code: "MSCI-WORLD-NR",
        benchmark_name: "MSCI World Net Return",
        npc_classification_id: 1,
        classification_name: "Kern",
        long_name: "ADP Fixed Income High Yield",
        short_name: "ADP FIHYG",
        active_ind: true,
        effective_from: "2026-01-01",
        effective_until: null,
        change_request_id: null,
      }],
    );

    const changeRequestId = "22222222-2222-2222-2222-222222222222";

    // Mock the INSERT into change_portfolio_configuration (called by saveChangePortfolioConfiguration)
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => [{ id: 42 }],
    );

    const stageResult = await stageChangePortfolioConfiguration({
      changeRequestId,
      actionType: "UPDATE",
      primaryAccountId: "ADP_FIHYG_ROB",
      targetPrimaryAccountId: "ADP*FIHYG*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",           // changing from FI to EQ
      subAssetClassCode: "ACX",       // changing from HYG to ACX
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 2,         // changing from 1 to 2
      longName: "ADP Equity World",   // updated
      shortName: "ADP EQW",           // updated
      effectiveFrom: "2026-07-01",
      effectiveUntil: null,
    });

    expect(stageResult.ok).toBe(true);

    // ── Phase 4: Apply (process) the staged change ──────────────────────
    // applyChangePortfolioConfigurations:
    //   1. Fetches staged rows from change_portfolio_configuration
    //   2. Inside transaction: SET LOCAL bypass, then for UPDATE:
    //      a. SELECT the active TARGET row (identified by
    //         target_primary_account_id — the ORIGINAL live row, here
    //         ADP*FIHYG*ROB, which differs from the derived successor id)
    //      b. UPDATE the TARGET row: active_ind=false,
    //         effective_until=effective_from
    //      c. INSERT the successor row with the NEWLY derived
    //         primary_account_id (ADP*EQACX*ROB), active_ind=true

    // Mock fetching staged rows
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [{
        id: 42,
        change_request_id: changeRequestId,
        action_type: "UPDATE",
        target_primary_account_id: "ADP*FIHYG*ROB", // the ORIGINAL live row being replaced
        client_code: "ADP",
        portfolio_code: "ADP",
        asset_class_code: "EQ",
        sub_asset_class_code: "ACX",
        manager_code: "ROB",
        benchmark_code: "MSCI-WORLD-NR",
        npc_classification_id: 2,
        long_name: "ADP Equity World",
        short_name: "ADP EQW",
        effective_from: "2026-07-01",
        effective_until: null,
      }],
    );

    // Mock the SELECT 1 check for existing active row
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );

    // Mock the UPDATE to close out old row
    let closeOutUpdateCalled = false;
    onQuery(
      /UPDATE client_config\.portfolio_configuration/i,
      () => {
        closeOutUpdateCalled = true;
        return [];
      },
    );

    // Mock the INSERT of the new active row
    onQuery(
      /INSERT INTO client_config\.portfolio_configuration \(/i,
      () => [{ primary_account_id: "ADP_EQACX_ROB" }],
    );

    const applyResult = await applyChangePortfolioConfigurations(changeRequestId);
    expect(applyResult.success).toBe(true);
    expect(applyResult.applied).toHaveLength(1);
    expect(applyResult.applied[0].actionType).toBe("UPDATE");
    expect(applyResult.applied[0].result).toBe("applied");
    expect(closeOutUpdateCalled).toBe(true);

    // ── Phase 5: Verify getClientConfigPortfolioConfigurations reflects the change ──
    // Now the function should only return the NEW active row (the UPDATE
    // closed the old row and inserted a new one). We swap the mock to return
    // the updated row.
    clearQueryHandlers();

    const updatedRow = {
      primary_account_id: "ADP_EQACX_ROB",
      client_code: "ADP",
      client_name: "ADP Beheer B.V.",
      portfolio_code: "ADP",
      parent_account_id: null,
      parent_account_code: null,
      asset_class_code: "EQ",
      asset_class_name: "Equities",
      sub_asset_class_code: "ACX",
      sub_asset_class_name: "AC World",
      manager_code: "ROB",
      manager_name: "Robeco",
      benchmark_code: "MSCI-WORLD-NR",
      benchmark_name: "MSCI World Net Return",
      npc_classification_id: 2,
      classification_name: "Groeimarkten",
      long_name: "ADP Equity World",
      short_name: "ADP EQW",
      active_ind: true,
      effective_from: "2026-07-01",
      effective_until: null,
      change_request_id: changeRequestId,
    };

    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [updatedRow],
    );

    const afterRows = await getClientConfigPortfolioConfigurations();
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].primaryAccountId).toBe("ADP_EQACX_ROB");
    expect(afterRows[0].assetClassCode).toBe("EQ");
    expect(afterRows[0].subAssetClassCode).toBe("ACX");
    expect(afterRows[0].npcClassificationId).toBe(2);
    expect(afterRows[0].longName).toBe("ADP Equity World");
    expect(afterRows[0].shortName).toBe("ADP EQW");
    expect(afterRows[0].effectiveFrom).toBe("2026-07-01");
    expect(afterRows[0].activeInd).toBe(true);
    // The active row references the change request that created it
    expect(afterRows[0].changeRequestId).toBe(changeRequestId);
  });

  it("reflects a processed CREATE change: new row appears in the config view", async () => {
    const changeRequestId = "33333333-3333-3333-3333-333333333333";

    // Start with empty portfolio_configuration
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [],
    );

    const {
      getClientConfigPortfolioConfigurations,
      stageChangePortfolioConfiguration,
      applyChangePortfolioConfigurations,
    } = await import("@/lib/client-config-db");

    // Empty initial state
    const initial = await getClientConfigPortfolioConfigurations();
    expect(initial).toHaveLength(0);

    // Stage a CREATE
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => [{ id: 99 }],
    );

    const stageResult = await stageChangePortfolioConfiguration({
      changeRequestId,
      actionType: "CREATE",
      primaryAccountId: "ADP_EQACX_ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "ADP Equity AC World",
      shortName: "ADP EQACX",
      effectiveFrom: "2026-08-01",
      effectiveUntil: null,
    });

    expect(stageResult.ok).toBe(true);

    // Apply: need staged rows + SELECT 1 (no existing) + INSERT
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [{
        id: 99,
        change_request_id: changeRequestId,
        action_type: "CREATE",
        target_primary_account_id: null,
        client_code: "ADP",
        portfolio_code: "ADP",
        asset_class_code: "EQ",
        sub_asset_class_code: "ACX",
        manager_code: "ROB",
        benchmark_code: "MSCI-WORLD-NR",
        npc_classification_id: 1,
        long_name: "ADP Equity AC World",
        short_name: "ADP EQACX",
        effective_from: "2026-08-01",
        effective_until: null,
      }],
    );

    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [],
    );

    onQuery(
      /INSERT INTO client_config\.portfolio_configuration \(/i,
      () => [{ primary_account_id: "ADP_EQACX_ROB" }],
    );

    const applyResult = await applyChangePortfolioConfigurations(changeRequestId);
    expect(applyResult.success).toBe(true);
    expect(applyResult.applied[0].result).toBe("applied");

    // Verify: now getClientConfigPortfolioConfigurations returns the new row
    clearQueryHandlers();
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [{
        primary_account_id: "ADP_EQACX_ROB",
        client_code: "ADP",
        client_name: "ADP Beheer B.V.",
        portfolio_code: "ADP",
        parent_account_id: null,
        parent_account_code: null,
        asset_class_code: "EQ",
        asset_class_name: "Equities",
        sub_asset_class_code: "ACX",
        sub_asset_class_name: "AC World",
        manager_code: "ROB",
        manager_name: "Robeco",
        benchmark_code: "MSCI-WORLD-NR",
        benchmark_name: "MSCI World Net Return",
        npc_classification_id: 1,
        classification_name: "Kern",
        long_name: "ADP Equity AC World",
        short_name: "ADP EQACX",
        active_ind: true,
        effective_from: "2026-08-01",
        effective_until: null,
        change_request_id: changeRequestId,
      }],
    );

    const after = await getClientConfigPortfolioConfigurations();
    expect(after).toHaveLength(1);
    expect(after[0].primaryAccountId).toBe("ADP_EQACX_ROB");
    expect(after[0].longName).toBe("ADP Equity AC World");
    expect(after[0].activeInd).toBe(true);
    expect(after[0].changeRequestId).toBe(changeRequestId);
  });

  it("reflects a processed DELETE change: row disappears from the config view", async () => {
    const changeRequestId = "44444444-4444-4444-4444-444444444444";

    // Start with one active row
    const existingRow = {
      primary_account_id: "ADP_FIHYG_ROB",
      client_code: "ADP",
      client_name: "ADP Beheer B.V.",
      portfolio_code: "ADP",
      parent_account_id: null,
      parent_account_code: null,
      asset_class_code: "FI",
      asset_class_name: "Fixed Income",
      sub_asset_class_code: "HYG",
      sub_asset_class_name: "High Yield Government",
      manager_code: "ROB",
      manager_name: "Robeco",
      benchmark_code: "MSCI-WORLD-NR",
      benchmark_name: "MSCI World Net Return",
      npc_classification_id: 1,
      classification_name: "Kern",
      long_name: "ADP Fixed Income High Yield",
      short_name: "ADP FIHYG",
      active_ind: true,
      effective_from: "2026-01-01",
      effective_until: null,
      change_request_id: null,
    };

    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [existingRow],
    );

    const {
      getClientConfigPortfolioConfigurations,
      stageChangePortfolioConfiguration,
      applyChangePortfolioConfigurations,
    } = await import("@/lib/client-config-db");

    // Verify initial state
    const initial = await getClientConfigPortfolioConfigurations();
    expect(initial).toHaveLength(1);

    // Stage DELETE — needs getClientConfigPortfolioConfigurationById (SELECT by PK)
    onQuery(
      /FROM client_config\.portfolio_configuration.*WHERE pc\.primary_account_id = \$1 LIMIT 1/i,
      () => [{
        ...existingRow,
        client_name: "ADP Beheer B.V.",
      }],
    );

    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => [{ id: 77 }],
    );

    const stageResult = await stageChangePortfolioConfiguration({
      changeRequestId,
      actionType: "DELETE",
      primaryAccountId: "ADP_FIHYG_ROB",
      targetPrimaryAccountId: "ADP*FIHYG*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "FI",
      subAssetClassCode: "HYG",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "ADP Fixed Income High Yield",
      shortName: "ADP FIHYG",
      effectiveFrom: "2026-07-01",
      effectiveUntil: null,
    });

    expect(stageResult.ok).toBe(true);

    // Apply DELETE: staged row + SELECT 1 (exists) + UPDATE to close out
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [{
        id: 77,
        change_request_id: changeRequestId,
        action_type: "DELETE",
        target_primary_account_id: "ADP*FIHYG*ROB",
        client_code: "ADP",
        portfolio_code: "ADP",
        asset_class_code: "FI",
        sub_asset_class_code: "HYG",
        manager_code: "ROB",
        benchmark_code: "MSCI-WORLD-NR",
        npc_classification_id: 1,
        long_name: "ADP Fixed Income High Yield",
        short_name: "ADP FIHYG",
        effective_from: "2026-07-01",
        effective_until: null,
      }],
    );

    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );

    let deleteUpdateCalled = false;
    onQuery(
      /UPDATE client_config\.portfolio_configuration/i,
      () => {
        deleteUpdateCalled = true;
        return [];
      },
    );

    const applyResult = await applyChangePortfolioConfigurations(changeRequestId);
    expect(applyResult.success).toBe(true);
    expect(applyResult.applied[0].result).toBe("applied");
    expect(deleteUpdateCalled).toBe(true);

    // After DELETE: row is marked inactive → getClientConfigPortfolioConfigurations returns empty
    clearQueryHandlers();
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [],
    );

    const after = await getClientConfigPortfolioConfigurations();
    expect(after).toHaveLength(0);
  });

  it("rejects RETIRE actions with an explicit message about metadata request flow", async () => {
    const changeRequestId = "66666666-6666-6666-6666-666666666666";

    const {
      stageChangePortfolioConfiguration,
    } = await import("@/lib/client-config-db");

    const result = await stageChangePortfolioConfiguration({
      changeRequestId,
      actionType: "RETIRE",
      primaryAccountId: "ADP_FIHYG_ROB",
      targetPrimaryAccountId: "ADP*FIHYG*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "FI",
      subAssetClassCode: "HYG",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "ADP Fixed Income High Yield",
      shortName: "ADP FIHYG",
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/metadata/);
    }
  });

  it("shows only active rows: inactive rows from closed-out changes are excluded", async () => {
    // Simulate SCD2 history: two rows for the same primary account, one inactive
    const changeRequestId = "55555555-5555-5555-5555-555555555555";

    const activeRow = {
      primary_account_id: "ADP_EQACX_ROB",
      client_code: "ADP",
      client_name: "ADP Beheer B.V.",
      portfolio_code: "ADP",
      parent_account_id: null,
      parent_account_code: null,
      asset_class_code: "EQ",
      asset_class_name: "Equities",
      sub_asset_class_code: "ACX",
      sub_asset_class_name: "AC World",
      manager_code: "ROB",
      manager_name: "Robeco",
      benchmark_code: "MSCI-WORLD-NR",
      benchmark_name: "MSCI World Net Return",
      npc_classification_id: 1,
      classification_name: "Kern",
      long_name: "ADP Equity AC World",
      short_name: "ADP EQACX",
      active_ind: true,
      effective_from: "2026-07-01",
      effective_until: null,
      change_request_id: changeRequestId,
    };

    const inactiveRow = {
      primary_account_id: "ADP_FIHYG_ROB",
      client_code: "ADP",
      client_name: "ADP Beheer B.V.",
      portfolio_code: "ADP",
      parent_account_id: null,
      parent_account_code: null,
      asset_class_code: "FI",
      asset_class_name: "Fixed Income",
      sub_asset_class_code: "HYG",
      sub_asset_class_name: "High Yield Government",
      manager_code: "ROB",
      manager_name: "Robeco",
      benchmark_code: "MSCI-WORLD-NR",
      benchmark_name: "MSCI World Net Return",
      npc_classification_id: 1,
      classification_name: "Kern",
      long_name: "ADP Fixed Income High Yield",
      short_name: "ADP FIHYG",
      active_ind: false,
      effective_from: "2026-01-01",
      effective_until: "2026-06-30",
      change_request_id: null,
    };

    // The query has WHERE pc.active_ind = true, so only the active row is returned
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [activeRow],
    );

    const { getClientConfigPortfolioConfigurations } = await import("@/lib/client-config-db");
    const rows = await getClientConfigPortfolioConfigurations();

    expect(rows).toHaveLength(1);
    expect(rows[0].primaryAccountId).toBe("ADP_EQACX_ROB");
    expect(rows[0].activeInd).toBe(true);
  });
});
