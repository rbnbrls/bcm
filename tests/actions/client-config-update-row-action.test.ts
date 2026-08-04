/**
 * Unit tests for updateClientConfigRowAction — the full-row update wizard
 * action (t_cb7f89f2).
 *
 * Verifies:
 *  - All 9 mutable fields are staged in the change_portfolio_configuration
 *    row and recorded in the change request fields (IST vs SOLL).
 *  - The action dispatches under the explicit lifecycle slug
 *    portfolio_configuration_update with actionType UPDATE.
 *  - Missing/invalid fields surface as validation errors without dispatch.
 *  - The operator is redirected to /changes on success.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";

// ── Admin-gate request scope ───────────────────────────────────────────────
// The admin actions call requireAdmin() (lib/admin-auth-request.ts) which
// reads the Authorization header via next/headers and compares it against
// ADMIN_USER / ADMIN_PASSWORD. Simulate an authenticated admin request.
const { ADMIN_USER, ADMIN_PASSWORD, ADMIN_AUTH_HEADER } = vi.hoisted(() => {
  const user = "test-admin";
  const password = "test-password";
  return {
    ADMIN_USER: user,
    ADMIN_PASSWORD: password,
    ADMIN_AUTH_HEADER:
      "Basic " + Buffer.from(`${user}:${password}`).toString("base64"),
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ authorization: ADMIN_AUTH_HEADER })),
}));

// ── Postgres mock (same pattern as client-config-lifecycle-slug.test.ts) ──
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

const UPDATE_CONFIG = {
  id: "a0000000-0000-0000-0000-000000000012",
  slug: "portfolio_configuration_update",
  name: "Portfolio configuratie wijzigen",
  description: "",
  category: "portfolio",
  cost: JSON.stringify({ baseCost: 500, costCurrency: "EUR", description: "" }),
  default_lead_days: 5,
  fields: "[]",
  stakeholders: "[]",
  workflow: "portfolio_configuration_update",
  active: true,
  sort_order: 7,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

const FUTURE_DATE = new Date(Date.now() + 30 * 86400000)
  .toISOString()
  .split("T")[0];

const EXISTING_ROW = {
  primary_account_id: "ADP*EQACX*ROB",
  portfolio_code: "ADP",
  client_code: "ADP",
  asset_class_code: "EQ",
  sub_asset_class_code: "ACX",
  manager_code: "ROB",
  benchmark_code: "MSCI-WORLD-NR",
  npc_classification_id: 1,
  long_name: "E2E Portfolio",
  short_name: "E2E-PF",
  effective_from: "2026-01-01",
  effective_until: null,
};

/** Stub the reference-data catalogs the wizard validates selections against. */
function stubReferenceData() {
  onQuery(/FROM client_config\.asset_class/i, () => [
    { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
    { asset_class_id: 2, asset_class_code: "FI", asset_class_name: "FIXED INCOME" },
  ]);
  onQuery(/FROM client_config\.sub_asset_class/i, () => [
    { sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" },
    { sub_asset_class_id: 2, asset_class_id: 1, sub_asset_class_code: "DEV", sub_asset_class_name: "DEVELOPED MARKETS" },
    { sub_asset_class_id: 3, asset_class_id: 2, sub_asset_class_code: "CRE", sub_asset_class_name: "CREDITS EUROPE" },
  ]);
  onQuery(/FROM client_config\.manager/i, () => [
    { manager_id: 1, manager_code: "ROB", manager_name: "ROBECO" },
    { manager_id: 2, manager_code: "UBS", manager_name: "UBS" },
  ]);
  onQuery(/FROM client_config\.benchmark/i, () => [
    { benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World NR", rimes_code: "MWNR" },
    { benchmark_id: 2, benchmark_code: "BBG-AGG", benchmark_name: "Bloomberg Aggregate", rimes_code: "BAGG" },
  ]);
  onQuery(/FROM client_config\.npc_classification/i, () => [
    { npc_classification_id: 1, classification_name: "Geen NPC" },
    { npc_classification_id: 3, classification_name: "Niet-pensioen (onbelegd)" },
  ]);
}

/** Stub the DB so updateClientConfigRowAction can run end to end. */
function stubDb() {
  onQuery(/FROM client_config\.portfolio/i, () => [EXISTING_ROW]);
  // Reference data (getClientConfigReferenceData) — the wizard validates the
  // dimension selections against these catalogs before staging.
  stubReferenceData();
  onQuery(/SELECT \* FROM change_type_config WHERE slug/i, (_sql, params) => {
    return String(params[0]) === "portfolio_configuration_update"
      ? [UPDATE_CONFIG]
      : [];
  });
  onQuery(/SELECT \* FROM change_type_config WHERE id/i, (_sql, params) => {
    return String(params[0]) === UPDATE_CONFIG.id ? [UPDATE_CONFIG] : [];
  });
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  onQuery(/INSERT INTO change_requests/i, () => []);
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [
    { id: 1 },
  ]);
}

function fullFormData(overrides: Record<string, string> = {}): FormData {
  return buildMockFormData({
    primaryAccountId: "ADP*EQACX*ROB",
    portfolioCode: "ADP",
    assetClassCode: "EQ",
    subAssetClassCode: "ACX",
    managerCode: "ROB",
    benchmarkCode: "MSCI-WORLD-NR",
    npcClassificationId: "1",
    longName: "E2E Portfolio",
    shortName: "E2E-PF",
    effectiveDate: FUTURE_DATE,
    requestedBy: "E2E Admin",
    rationale: "Full-row update via the prefilled wizard.",
    ...overrides,
  });
}

// ── Global hooks ────────────────────────────────────────────────────────────
beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
  process.env.ADMIN_USER = ADMIN_USER;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => {
  delete process.env.ADMIN_USER;
  delete process.env.ADMIN_PASSWORD;
});

describe("updateClientConfigRowAction — full-row update wizard", () => {
  it("stages an UPDATE change request with all mutable fields as SOLL", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDb();
    mockRedirect.mockClear();

    let staged: Record<string, unknown> | null = null;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      (_sql, params) => {
        staged = Object.fromEntries(params.map((p, i) => [`p${i + 1}`, p]));
        return [{ id: 1 }];
      },
    );

    let savedFields: {
      fieldKey: string;
      istValue: unknown;
      sollValue: unknown;
    }[] = [];
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      // fields are JSON-serialized in one of the params
      for (const p of params) {
        if (typeof p === "string" && p.includes("primary_account_id")) {
          try {
            savedFields = JSON.parse(p);
          } catch {
            /* not the fields param */
          }
        }
      }
      return [];
    });

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    try {
      await updateClientConfigRowAction(
        {},
        fullFormData({
          portfolioCode: "ADP2",
          assetClassCode: "EQ",
          subAssetClassCode: "DEV",
          managerCode: "UBS",
          benchmarkCode: "BBG-AGG",
          npcClassificationId: "3",
          longName: "E2E Portfolio (gewijzigd)",
          shortName: "E2E-PF2",
          effectiveDate: FUTURE_DATE,
        }),
      );
    } catch {
      /* redirect throw */
    }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringMatching(/^\/changes\/[0-9a-f-]{36}$/),
    );

    expect(staged).not.toBeNull();
    const stagedValues = Object.values(staged!);
    expect(stagedValues).toContain("ADP2");
    expect(stagedValues).toContain("DEV");
    expect(stagedValues).toContain("UBS");
    expect(stagedValues).toContain("BBG-AGG");
    expect(stagedValues).toContain(3);
    expect(stagedValues).toContain("E2E Portfolio (gewijzigd)");
    expect(stagedValues).toContain("E2E-PF2");
    expect(stagedValues).toContain(FUTURE_DATE);

    // Every mutable field is recorded with IST and SOLL in the change fields
    const byKey = Object.fromEntries(savedFields.map((f) => [f.fieldKey, f]));
    expect(byKey["portfolio_code"].istValue).toBe("ADP");
    expect(byKey["portfolio_code"].sollValue).toBe("ADP2");
    expect(byKey["asset_class_code"].sollValue).toBe("EQ");
    expect(byKey["sub_asset_class_code"].sollValue).toBe("DEV");
    expect(byKey["manager_code"].sollValue).toBe("UBS");
    expect(byKey["benchmark_code"].sollValue).toBe("BBG-AGG");
    expect(byKey["npc_classification_id"].sollValue).toBe("3");
    expect(byKey["long_name"].sollValue).toBe("E2E Portfolio (gewijzigd)");
    expect(byKey["short_name"].sollValue).toBe("E2E-PF2");
    expect(byKey["action_type"].sollValue).toBe("UPDATE");
  });

  it("stages unchanged values (IST = SOLL) when the wizard is submitted as-is", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDb();
    mockRedirect.mockClear();

    let savedFields: {
      fieldKey: string;
      istValue: unknown;
      sollValue: unknown;
    }[] = [];
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p.includes("primary_account_id")) {
          try {
            savedFields = JSON.parse(p);
          } catch {
            /* not the fields param */
          }
        }
      }
      return [];
    });

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    try {
      // Submit exactly the row's current values (IST)
      await updateClientConfigRowAction({}, fullFormData());
    } catch {
      /* redirect throw */
    }

    expect(mockRedirect).toHaveBeenCalledTimes(1);

    const byKey = Object.fromEntries(savedFields.map((f) => [f.fieldKey, f]));
    expect(byKey["portfolio_code"].istValue).toBe("ADP");
    expect(byKey["portfolio_code"].sollValue).toBe("ADP");
    expect(byKey["long_name"].istValue).toBe("E2E Portfolio");
    expect(byKey["long_name"].sollValue).toBe("E2E Portfolio");
    expect(byKey["npc_classification_id"].sollValue).toBe("1");
    expect(byKey["effective_from"].istValue).toBe("2026-01-01");
    expect(byKey["effective_from"].sollValue).toBe("2026-09-03");
  });

  it("returns validation errors without dispatching when a required field is missing", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDb();

    let dispatchCount = 0;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => {
        dispatchCount++;
        return [{ id: 1 }];
      },
    );

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    const result = await updateClientConfigRowAction(
      {},
      fullFormData({
        longName: "", // required field emptied
        rationale: "te kort", // below min 10 chars
      }),
    );

    expect(result.success).toBe(false);
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(result.issues!.some((i) => i.includes("Lange naam"))).toBe(true);
    expect(result.issues!.some((i) => i.includes("10 tekens"))).toBe(true);
    expect(dispatchCount).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("rejects an unknown primaryAccountId without staging", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    // Reference data present, but the row lookup returns nothing → "bestaat niet"
    stubReferenceData();
    onQuery(/FROM client_config\.portfolio/i, () => []);
    onQuery(/SELECT \* FROM change_type_config WHERE slug/i, () => [
      UPDATE_CONFIG,
    ]);

    let dispatchCount = 0;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => {
        dispatchCount++;
        return [{ id: 1 }];
      },
    );

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    const result = await updateClientConfigRowAction(
      {},
      fullFormData({
        primaryAccountId: "XXX*YY*ZZZ",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("bestaat niet");
    expect(dispatchCount).toBe(0);
  });

  it("returns inline field errors for an unknown benchmark without staging", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubReferenceData();
    onQuery(/FROM client_config\.portfolio/i, () => [EXISTING_ROW]);

    let dispatchCount = 0;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => {
        dispatchCount++;
        return [{ id: 1 }];
      },
    );

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    const result = await updateClientConfigRowAction(
      {},
      fullFormData({ benchmarkCode: "NOPE-INDEX" }),
    );

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.benchmarkCode).toContain("NOPE-INDEX");
    expect(result.issues?.some((i) => i.includes("NOPE-INDEX"))).toBe(true);
    expect(dispatchCount).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns an inline field error when the sub-asset class does not belong to the asset class", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubReferenceData();
    onQuery(/FROM client_config\.portfolio/i, () => [EXISTING_ROW]);

    let dispatchCount = 0;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => {
        dispatchCount++;
        return [{ id: 1 }];
      },
    );

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    // "DEV" is a valid sub-asset class, but not under asset class "FI"
    const result = await updateClientConfigRowAction(
      {},
      fullFormData({
        assetClassCode: "FI",
        subAssetClassCode: "DEV",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.subAssetClassCode).toContain(
      "hoort niet bij",
    );
    expect(dispatchCount).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns inline field errors for unknown manager and NPC selections without staging", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubReferenceData();
    onQuery(/FROM client_config\.portfolio/i, () => [EXISTING_ROW]);

    let dispatchCount = 0;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => {
        dispatchCount++;
        return [{ id: 1 }];
      },
    );

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    const result = await updateClientConfigRowAction(
      {},
      fullFormData({
        managerCode: "ZZZ",
        npcClassificationId: "999",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.managerCode).toContain("ZZZ");
    expect(result.fieldErrors?.npcClassificationId).toContain("999");
    expect(dispatchCount).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
