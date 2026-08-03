/**
 * Unit tests for the retire (DELETE) STAGING shape produced by
 * deletePortfolioConfigurationAction (t_a6d732ef).
 *
 * Acceptance criterion pinned here: the staged change_portfolio_configuration
 * row for a retire carries the requested retirement date in BOTH
 * effective_from and effective_until, so the apply step
 * (applyChangePortfolioConfigurations) can set the live row's
 * effective_until to the requested date when the change is processed.
 *
 * (The processing-side behavior — live row active_ind=false and
 * effective_until = requested date — is covered by
 * tests/change-portfolio-config-workflow.test.ts and
 * tests/retire-apply-integration.test.ts.)
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

// ── Postgres mock (same pattern as client-config-delete-action.test.ts) ──
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

const UPDATE_CONFIG = {
  ...RETIRE_CONFIG,
  id: "a0000000-0000-0000-0000-000000000013",
  slug: "portfolio_configuration_update",
  name: "Portefeuilleconfiguratie wijzigen",
  workflow: "portfolio_configuration_update",
  sort_order: 6,
};

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

function stubDb(options: { row?: typeof EXISTING_ROW | null } = {}) {
  const row = options.row === undefined ? EXISTING_ROW : options.row;
  onQuery(/FROM client_config\.portfolio/i, () => (row ? [row] : []));
  stubReferenceData();
  onQuery(/SELECT \* FROM change_type_config WHERE slug/i, (_sql, params) => {
    const slug = String(params[0]);
    return slug === RETIRE_CONFIG.slug
      ? [RETIRE_CONFIG]
      : slug === UPDATE_CONFIG.slug
        ? [UPDATE_CONFIG]
        : [];
  });
  onQuery(/SELECT \* FROM change_type_config WHERE id/i, (_sql, params) => {
    const id = String(params[0]);
    return id === RETIRE_CONFIG.id
      ? [RETIRE_CONFIG]
      : id === UPDATE_CONFIG.id
        ? [UPDATE_CONFIG]
        : [];
  });
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  onQuery(/SELECT id FROM clients/i, () => [
    { id: "c0000000-0000-0000-0000-000000000001" },
  ]);
  onQuery(/INSERT INTO change_requests/i, () => []);
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [
    { id: 1 },
  ]);
}

function deleteFormData(overrides: Record<string, string> = {}): FormData {
  return buildMockFormData({
    primaryAccountId: "ADP*EQACX*ROB",
    requestedBy: "E2E Admin",
    rationale: "Acceptance test — retire this portfolio config.",
    effectiveDate: FUTURE_DATE,
    ...overrides,
  });
}

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

describe("deletePortfolioConfigurationAction — staged retirement date", () => {
  it("stages the requested retirement date in both effective_from and effective_until", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDb();
    mockRedirect.mockClear();

    // change_request_id, action_type, target_primary_account_id, client_code,
    // portfolio_code, asset_class_code, sub_asset_class_code, manager_code,
    // benchmark_code, npc_classification_id, long_name, short_name,
    // effective_from, effective_until
    let staged: Record<string, unknown> | null = null;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      (_sql, params) => {
        staged = {
          actionType: params[1],
          targetPrimaryAccountId: params[2],
          effectiveFrom: params[12],
          effectiveUntil: params[13],
        };
        return [{ id: 1 }];
      },
    );

    const { deletePortfolioConfigurationAction } =
      await import("@/app/admin/client-config/actions");
    try {
      await deletePortfolioConfigurationAction({}, deleteFormData());
    } catch {
      /* redirect throw */
    }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/changes");

    expect(staged).not.toBeNull();
    expect(staged!.actionType).toBe("DELETE");
    expect(staged!.targetPrimaryAccountId).toBe("ADP*EQACX*ROB");
    // The requested retirement date is staged in BOTH effective_from (the
    // date the change takes effect) and effective_until (the date the live
    // row must be closed out) — the apply uses effective_until verbatim.
    expect(staged!.effectiveFrom).toBe(FUTURE_DATE);
    expect(staged!.effectiveUntil).toBe(FUTURE_DATE);
  });

  it("leaves effective_until null on CREATE/UPDATE staging (only DELETE carries a retirement date)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDb();
    mockRedirect.mockClear();

    let staged: Record<string, unknown> | null = null;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      (_sql, params) => {
        staged = {
          actionType: params[1],
          effectiveFrom: params[12],
          effectiveUntil: params[13],
        };
        return [{ id: 1 }];
      },
    );

    const { updateClientConfigRowAction } =
      await import("@/app/admin/client-config/actions");
    try {
      await updateClientConfigRowAction(
        {},
        buildMockFormData({
          primaryAccountId: "ADP*EQACX*ROB",
          requestedBy: "E2E Admin",
          rationale: "Acceptance test — update this portfolio config.",
          effectiveDate: FUTURE_DATE,
          portfolioCode: "ADP",
          assetClassCode: "EQ",
          subAssetClassCode: "ACX",
          managerCode: "ROB",
          benchmarkCode: "MSCI-WORLD-NR",
          npcClassificationId: "1",
          longName: "E2E Portfolio",
          shortName: "E2E-PF",
        }),
      );
    } catch {
      /* redirect throw */
    }

    expect(staged).not.toBeNull();
    expect(staged!.actionType).toBe("UPDATE");
    expect(staged!.effectiveFrom).toBe(FUTURE_DATE);
    // UPDATE rows keep the live row's effective_until (null here) — the
    // successor inherits it; only DELETE stages the retirement date.
    expect(staged!.effectiveUntil).toBeNull();
  });
});
