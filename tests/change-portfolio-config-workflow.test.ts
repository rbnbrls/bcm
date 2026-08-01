/**
 * Tests for the change_portfolio_configuration workflow.
 *
 * Covers:
 *  - getChangePortfolioConfigurations (fallback when no DB)
 *  - stageChangePortfolioConfiguration with validation
 *  - applyChangePortfolioConfigurations (SCD2 logic + enforcement bypass)
 *  - The change-processor that wires the apply step into the change request
 *    status transition.
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

describe("client-config-db change_portfolio_configuration workflow (mocked DB)", () => {
  it("getChangePortfolioConfigurations returns staged rows for the change request", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "CREATE",
          target_primary_account_id: null,
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { getChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const rows = await getChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actionType).toBe("CREATE");
    expect(rows[0].portfolioCode).toBe("ADP");
    expect(rows[0].assetClassCode).toBe("EQ");
    expect(rows[0].subAssetClassCode).toBe("ACX");
    expect(rows[0].managerCode).toBe("ROB");
  });

  it("stageChangePortfolioConfiguration rejects invalid payloads without DB writes", async () => {
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "CREATE",
      clientCode: "ADP",
      portfolioCode: "adp", // lowercase → fails format check
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Test",
      shortName: "TST",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
    expect(insertCalled).toBe(false);
  });

  it("stageChangePortfolioConfiguration stages a valid CREATE payload", async () => {
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 7 }]);

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "CREATE",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Test",
      shortName: "TST",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("7");
    }
  });

  it("applyChangePortfolioConfigurations handles CREATE: inserts a new active row", async () => {
    // No existing row.
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [],
    );
    onQuery(
      /INSERT INTO client_config\.portfolio_configuration/i,
      () => [{ primary_account_id: "ADP_EQACX_ROB" }],
    );

    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "CREATE",
          target_primary_account_id: null,
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].actionType).toBe("CREATE");
    expect(result.applied[0].result).toBe("applied");
  });

  it("applyChangePortfolioConfigurations handles UPDATE: closes out old row and inserts new one", async () => {
    // Both SELECT 1 calls return a row (existing).
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );
    let updates = 0;
    let inserts = 0;
    onQuery(/UPDATE client_config\.portfolio_configuration/i, () => {
      updates += 1;
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      inserts += 1;
      return [{ primary_account_id: "ADP_EQACX_ROB" }];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "UPDATE",
          target_primary_account_id: "ADP*EQACX*ROB",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Updated",
          short_name: "UPD",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(updates).toBe(1);
    expect(inserts).toBe(1);
    expect(result.success).toBe(true);
    expect(result.applied[0].result).toBe("applied");
  });

  it("applyChangePortfolioConfigurations handles DELETE: marks row inactive", async () => {
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );
    let updates = 0;
    onQuery(/UPDATE client_config\.portfolio_configuration/i, () => {
      updates += 1;
      return [];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "DELETE",
          target_primary_account_id: "ADP*EQACX*ROB",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(updates).toBe(1);
    expect(result.success).toBe(true);
    expect(result.applied[0].actionType).toBe("DELETE");
    expect(result.applied[0].result).toBe("applied");
  });

  it("applyChangePortfolioConfigurations UPDATE closes the TARGET row and inserts successor with the NEW derived id (identity change)", async () => {
    // The staged row changes asset_class FI→EQ and sub_asset_class HYG→ACX:
    // the derived id (ADP*EQACX*ROB) differs from the target row id
    // (ADP*FIHYG*ROB). The close-out must target the ORIGINAL row and the
    // successor INSERT must carry the NEWLY derived id.
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );
    const closeOutParams: unknown[][] = [];
    const insertParams: unknown[][] = [];
    onQuery(/UPDATE client_config\.portfolio_configuration/i, (_sql, params) => {
      closeOutParams.push(params);
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, (_sql, params) => {
      insertParams.push(params);
      return [{ primary_account_id: "ADP*EQACX*ROB" }];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "UPDATE",
          target_primary_account_id: "ADP*FIHYG*ROB", // the ORIGINAL live row
          client_code: "ADP",
          portfolio_code: "ADP",
          asset_class_code: "EQ", // changed from FI
          sub_asset_class_code: "ACX", // changed from HYG
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 2,
          long_name: "ADP Equity World",
          short_name: "ADP EQW",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied[0].result).toBe("applied");
    // Close-out UPDATE: WHERE primary_account_id = $2 must be the TARGET id.
    expect(closeOutParams).toHaveLength(1);
    expect(closeOutParams[0][1]).toBe("ADP*FIHYG*ROB");
    // Successor INSERT: first param (primary_account_id) is the NEW derived id.
    expect(insertParams).toHaveLength(1);
    expect(insertParams[0][0]).toBe("ADP*EQACX*ROB");
  });

  it("applyChangePortfolioConfigurations UPDATE fails when the TARGET row is missing (identity change)", async () => {
    // Target row ADP*FIHYG*ROB does not exist even though a row with the
    // derived id ADP*EQACX*ROB might — the lookup is target-based.
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [],
    );
    let updates = 0;
    let inserts = 0;
    onQuery(/UPDATE client_config\.portfolio_configuration/i, () => {
      updates += 1;
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      inserts += 1;
      return [];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "UPDATE",
          target_primary_account_id: "ADP*FIHYG*ROB",
          client_code: "ADP",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 2,
          long_name: "ADP Equity World",
          short_name: "ADP EQW",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(false);
    expect(result.applied[0].result).toBe("failed");
    expect(result.applied[0].error).toContain("Geen actieve configuratie");
    expect(updates).toBe(0);
    expect(inserts).toBe(0);
  });

  it("applyChangePortfolioConfigurations DELETE retires the TARGET row and never inserts a successor (identity change)", async () => {
    // The staged row carries changed dims (derived id ADP*EQACX*ROB) but the
    // row to retire is the target ADP*FIHYG*ROB. No INSERT may happen.
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );
    const retireParams: unknown[][] = [];
    let inserts = 0;
    onQuery(/UPDATE client_config\.portfolio_configuration/i, (_sql, params) => {
      retireParams.push(params);
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      inserts += 1;
      return [];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "DELETE",
          target_primary_account_id: "ADP*FIHYG*ROB",
          client_code: "ADP",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 2,
          long_name: "To retire",
          short_name: "RET",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied[0].result).toBe("applied");
    expect(result.applied[0].primaryAccountId).toBe("ADP*FIHYG*ROB");
    expect(inserts).toBe(0);
    // Retire UPDATE: WHERE primary_account_id = $2 must be the TARGET id.
    expect(retireParams).toHaveLength(1);
    expect(retireParams[0][1]).toBe("ADP*FIHYG*ROB");
  });

  it("applyChangePortfolioConfigurations DELETE works without a derivable id (target-only)", async () => {
    // DELETE never derives a successor id, so it must succeed even when the
    // staged dimension codes cannot produce a primaryAccountId.
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );
    let updates = 0;
    let inserts = 0;
    onQuery(/UPDATE client_config\.portfolio_configuration/i, () => {
      updates += 1;
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      inserts += 1;
      return [];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "DELETE",
          target_primary_account_id: "ADP*FIHYG*ROB",
          client_code: "ADP",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "", // cannot derive a full id
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 2,
          long_name: "To retire",
          short_name: "RET",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied[0].result).toBe("applied");
    expect(updates).toBe(1);
    expect(inserts).toBe(0);
  });

  it("applyChangePortfolioConfigurations: CREATE skips when an active row already exists", async () => {
    onQuery(
      /SELECT 1 FROM client_config\.portfolio_configuration/i,
      () => [{ "?column?": 1 }],
    );
    let inserts = 0;
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      inserts += 1;
      return [];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "CREATE",
          target_primary_account_id: null,
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(inserts).toBe(0);
    expect(result.applied[0].result).toBe("skipped");
  });

  it("applyChangePortfolioConfigurations for UPDATE fails when no existing active row", async () => {
    // No existing active row → SELECT returns empty.
    onQuery(
      /AND active_ind = true/i,
      () => [],
    );
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "UPDATE",
          target_primary_account_id: "ADP*EQACX*ROB",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Updated",
          short_name: "UPD",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(false); // single failure fails the batch
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].actionType).toBe("UPDATE");
    expect(result.applied[0].result).toBe("failed");
    expect(result.applied[0].error).toContain("Geen actieve configuratie");
  });

  it("applyChangePortfolioConfigurations for DELETE skips when no existing active row", async () => {
    onQuery(
      /AND active_ind = true/i,
      () => [],
    );
    let updates = 0;
    onQuery(/UPDATE client_config\.portfolio_configuration/i, () => {
      updates += 1;
      return [];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "DELETE",
          target_primary_account_id: "ADP*EQACX*ROB",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(updates).toBe(0);
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].actionType).toBe("DELETE");
    expect(result.applied[0].result).toBe("skipped");
    expect(result.applied[0].error).toContain("Geen actieve configuratie");
  });

  it("stageChangePortfolioConfiguration rejects UPDATE without targetPrimaryAccountId", async () => {
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "UPDATE",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Updated name",
      shortName: "UPD",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("targetPrimaryAccountId is verplicht"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("stageChangePortfolioConfiguration rejects DELETE without targetPrimaryAccountId", async () => {
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "DELETE",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "To retire",
      shortName: "RET",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("targetPrimaryAccountId is verplicht"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("stageChangePortfolioConfiguration rejects a CREATE with a targetPrimaryAccountId", async () => {
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "CREATE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Test",
      shortName: "TST",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("targetPrimaryAccountId is niet toegestaan"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("stageChangePortfolioConfiguration stages a valid UPDATE payload", async () => {
    // Simulate an existing row for the UPDATE pre-check.
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [
        {
          primary_account_id: "ADP_EQACX_ROB",
          client_code: "ADP",
          client_name: "ADP",
          portfolio_code: "ADP",
          parent_account_id: null,
          parent_account_code: null,
          asset_class_code: "EQ",
          asset_class_name: "Equities",
          sub_asset_class_code: "ACX",
          sub_asset_class_name: "ACX",
          manager_code: "ROB",
          manager_name: "Robeco",
          benchmark_code: "MSCI-WORLD-NR",
          benchmark_name: "MSCI World NR",
          npc_classification_id: 1,
          classification_name: "Fiduciary",
          long_name: "Original",
          short_name: "ORG",
          active_ind: true,
          effective_from: "2026-01-01",
          effective_until: null,
          change_request_id: "22222222-2222-2222-2222-222222222222",
        },
      ],
    );
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 8 }]);

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "UPDATE",
      primaryAccountId: "ADP*EQACX*ROB",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Updated name",
      shortName: "UPD",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("8");
    }
  });

  it("stageChangePortfolioConfiguration stages a valid DELETE payload", async () => {
    // Simulate an existing row for the DELETE pre-check.
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [
        {
          primary_account_id: "ADP_EQACX_ROB",
          client_code: "ADP",
          client_name: "ADP",
          portfolio_code: "ADP",
          parent_account_id: null,
          parent_account_code: null,
          asset_class_code: "EQ",
          asset_class_name: "Equities",
          sub_asset_class_code: "ACX",
          sub_asset_class_name: "ACX",
          manager_code: "ROB",
          manager_name: "Robeco",
          benchmark_code: "MSCI-WORLD-NR",
          benchmark_name: "MSCI World NR",
          npc_classification_id: 1,
          classification_name: "Fiduciary",
          long_name: "To retire",
          short_name: "RET",
          active_ind: true,
          effective_from: "2026-01-01",
          effective_until: null,
          change_request_id: "22222222-2222-2222-2222-222222222222",
        },
      ],
    );
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 9 }]);

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "DELETE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "To retire",
      shortName: "RET",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("9");
    }
  });

  it("stageChangePortfolioConfiguration rejects UPDATE when row does not exist", async () => {
    // No existing row returned.
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "UPDATE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Updated name",
      shortName: "UPD",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("bestaat niet"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("stageChangePortfolioConfiguration rejects DELETE when row does not exist", async () => {
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "DELETE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "To retire",
      shortName: "RET",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("bestaat niet"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("stageChangePortfolioConfiguration stages UPDATE with explicit matching primaryAccountId", async () => {
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [
        {
          primary_account_id: "ADP_EQACX_ROB",
          client_code: "ADP",
          client_name: "ADP",
          portfolio_code: "ADP",
          parent_account_id: null,
          parent_account_code: null,
          asset_class_code: "EQ",
          asset_class_name: "Equities",
          sub_asset_class_code: "ACX",
          sub_asset_class_name: "ACX",
          manager_code: "ROB",
          manager_name: "Robeco",
          benchmark_code: "MSCI-WORLD-NR",
          benchmark_name: "MSCI World NR",
          npc_classification_id: 1,
          classification_name: "Fiduciary",
          long_name: "Original",
          short_name: "ORG",
          active_ind: true,
          effective_from: "2026-01-01",
          effective_until: null,
          change_request_id: "22222222-2222-2222-2222-222222222222",
        },
      ],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 10 }];
    });

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "UPDATE",
      primaryAccountId: "ADP*EQACX*ROB",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Updated name",
      shortName: "UPD",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("10");
    }
    expect(insertCalled).toBe(true);
  });

  it("updateChangePortfolioConfiguration patches a staged row", async () => {
    onQuery(/UPDATE client_config\.change_portfolio_configuration/i, () => []);

    const { updateChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    await expect(
      updateChangePortfolioConfiguration(1, {
        longName: "Patched name",
        shortName: "PAT",
      }),
    ).resolves.toBeUndefined();
  });

  // ── Identity-changing update regression tests ────────────────────────

  it("stageChangePortfolioConfiguration for UPDATE rejects when the target row does not exist", async () => {
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });
    // No handler for getClientConfigPortfolioConfigurationById -> returns []

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "UPDATE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "FI",
      subAssetClassCode: "HYG",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Identity changed",
      shortName: "IDCHG",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("bestaat niet"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("stageChangePortfolioConfiguration for UPDATE with explicit target row but NEW dimension codes (identity change passes staging)", async () => {
    // The target row is identified by targetPrimaryAccountId — the ORIGINAL
    // live row id. It is looked up independently of the derived successor id:
    // providing the OLD target id with NEW dimension codes passes staging,
    // because the target row exists. The staged row carries the NEW codes; at
    // apply time the identity is re-derived from the NEW codes
    // (ADP*FIHYG*ROB), which differs from the existing row's identity
    // (ADP*EQACX*ROB) — apply-time consistency is enforced by
    // applyChangePortfolioConfigurations (see test below).
    onQuery(
      /FROM client_config\.portfolio_configuration pc/i,
      () => [
        {
          primary_account_id: "ADP*EQACX*ROB",
          client_code: "ADP",
          client_name: "ADP",
          portfolio_code: "ADP",
          parent_account_id: null,
          parent_account_code: null,
          asset_class_code: "EQ",
          asset_class_name: "Equities",
          sub_asset_class_code: "ACX",
          sub_asset_class_name: "ACX",
          manager_code: "ROB",
          manager_name: "Robeco",
          benchmark_code: "MSCI-WORLD-NR",
          benchmark_name: "MSCI World NR",
          npc_classification_id: 1,
          classification_name: "Fiduciary",
          long_name: "Original",
          short_name: "ORG",
          active_ind: true,
          effective_from: "2026-01-01",
          effective_until: null,
          change_request_id: "22222222-2222-2222-2222-222222222222",
        },
      ],
    );
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 20 }]);

    const { stageChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const result = await stageChangePortfolioConfiguration({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      actionType: "UPDATE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "FI",
      subAssetClassCode: "HYG",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Identity changed via staged codes",
      shortName: "IDCHG",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
    });

    // The staging PASSES: the target row (ADP*EQACX*ROB) exists, and the
    // target validation is independent of the derived successor id
    // (ADP*FIHYG*ROB from the new FI/HYG codes). Apply-time identity checks
    // are a separate concern handled by applyChangePortfolioConfigurations.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("20");
    }
  });

  it("applyChangePortfolioConfigurations for UPDATE fails when staged dimension codes imply a different identity than the existing row", async () => {
    // Staged row dimension codes produce a primary_account_id that differs
    // from what exists in the live portfolio_configuration table.
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "UPDATE",
          target_primary_account_id: "ADP*FIHYG*ROB",
          client_code: "ADP",
          portfolio_code: "ADP",
          asset_class_code: "FI",
          sub_asset_class_code: "HYG",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Patched identity",
          short_name: "PCHG",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );
    onQuery(/SET LOCAL/i, () => []);

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );

    expect(result.success).toBe(false);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].actionType).toBe("UPDATE");
    expect(result.applied[0].result).toBe("failed");
  });

  it("updateChangePortfolioConfiguration allows changing dimension codes on a staged row (identity can drift after staging)", async () => {
    // Once an UPDATE is staged, updateChangePortfolioConfiguration allows
    // changing any field including identity-critical dimension codes.
    const sqlUpdates: string[] = [];
    onQuery(/UPDATE client_config\.change_portfolio_configuration/i, (sql: string) => {
      sqlUpdates.push(sql.substring(0, 100));
      return [];
    });

    const { updateChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    await expect(
      updateChangePortfolioConfiguration(1, {
        assetClassCode: "FI",
        subAssetClassCode: "HYG",
        longName: "Identity drifted after staging",
      }),
    ).resolves.toBeUndefined();

    expect(sqlUpdates.length).toBeGreaterThan(0);
  });

  it("deleteChangePortfolioConfiguration removes a staged row", async () => {
    onQuery(/DELETE FROM client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);

    const { deleteChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const deleted = await deleteChangePortfolioConfiguration(1);
    expect(deleted).toBe(true);
  });

  it("deleteChangePortfolioConfiguration returns false when no row deleted", async () => {
    onQuery(/DELETE FROM client_config\.change_portfolio_configuration/i, () => []);

    const { deleteChangePortfolioConfiguration } = await import("@/lib/client-config-db");
    const deleted = await deleteChangePortfolioConfiguration(999);
    expect(deleted).toBe(false);
  });

  it("applyChangePortfolioConfigurations passes enforcement bypass gate (SET LOCAL)", async () => {
    // Register the SET LOCAL handler FIRST so it doesn't get shadowed
    let setLocalCalled = false;
    onQuery(
      /SET LOCAL/i,
      () => {
        setLocalCalled = true;
        return [];
      },
    );

    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "CREATE",
          target_primary_account_id: null,
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );
    onQuery(/SELECT 1 FROM client_config\.portfolio_configuration/i, () => []);
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => [{ primary_account_id: "ADP_EQACX_ROB" }]);

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );

    expect(setLocalCalled).toBe(true);
    expect(result.success).toBe(true);
  });
});

describe("change-processor (mocked DB)", () => {
  it("uses the 3NF apply path when staged rows are present", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "CREATE",
          target_primary_account_id: null,
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );
    onQuery(/SELECT 1 FROM client_config\.portfolio_configuration/i, () => []);
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => [{ primary_account_id: "ADP_EQACX_ROB" }]);

    const { processChangeForProcessedStatus } = await import("@/lib/change-processor");
    const result = await processChangeForProcessedStatus(
      "11111111-1111-1111-1111-111111111111",
      "portfolio_addition",
    );
    expect(result.usedLegacy).toBe(false);
    expect(result.stagedRows).toBe(1);
    expect(result.applied).toBe(true);
  });

  it("falls back to the legacy path when no staged rows are present", async () => {
    onQuery(/FROM client_config\.change_portfolio_configuration/i, () => []);
    onQuery(
      /FROM change_requests/i,
      () => [
        {
          id: "11111111-1111-1111-1111-111111111111",
          change_type: "portfolio_addition",
          fields: '[]',
        },
      ],
    );
    onQuery(/SELECT 1 FROM portfolios/i, () => []);
    onQuery(/FROM client_config\.asset_class/i, () => []);
    onQuery(/FROM client_config\.sub_asset_class/i, () => []);
    onQuery(/SELECT 1 FROM managers/i, () => []);
    onQuery(/SELECT 1 FROM benchmarks/i, () => []);
    onQuery(/SELECT 1 FROM wtp_classifications/i, () => []);
    onQuery(/SELECT 1 FROM clients/i, () => []);

    // Legacy createPortfolioFromChangeAction calls sql directly; our mock
    // simply returns []. The function will return success=false (no fields).
    const { processChangeForProcessedStatus } = await import("@/lib/change-processor");
    const result = await processChangeForProcessedStatus(
      "11111111-1111-1111-1111-111111111111",
      "portfolio_addition",
    );
    expect(result.usedLegacy).toBe(true);
    expect(result.stagedRows).toBe(0);
  });
});
