/**
 * Tests for the change_portfolio_configuration workflow.
 *
 * Covers:
 *  - getChangePortfolioConfigurations (fallback when no DB)
 *  - stageChangePortfolioConfiguration with validation
 *  - applyChangePortfolioConfigurations (SCD2 logic)
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
    onQuery(/SELECT 1 FROM asset_classes/i, () => []);
    onQuery(/SELECT 1 FROM sub_asset_classes/i, () => []);
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
