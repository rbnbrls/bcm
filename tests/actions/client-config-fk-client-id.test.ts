/**
 * Regression tests for t_1b31ea3a: change_requests.client_id FK violation.
 *
 * Both client-config change flows (create + admin edit) used a random
 * change-request UUID as the client_id placeholder, which violates the
 * `change_requests_client_id_fkey` constraint on a real database.
 *
 * The fix resolves a real `clients.id` from the client code via
 * `getPublicClientIdByCode` (external_reference convention "PF-<CODE>-<NNN>"),
 * falling back to the placeholder only when no public clients row matches
 * (demo/mocked envs).
 *
 * These tests assert the admin dispatch path passes a REAL client id when
 * the lookup matches, and falls back to the placeholder otherwise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Postgres mock (same pattern as client-config-lifecycle-slug.test.ts) ──
const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown[]>();
const unmatchedSqlLog: string[] = [];

function onQuery(pattern: RegExp, handler: (sql: string, params: unknown[]) => unknown[]) {
  queryHandlers.set(pattern.source, handler);
}
function clearQueryHandlers() {
  queryHandlers.clear();
  unmatchedSqlLog.length = 0;
}

vi.mock("postgres", () => {
  const handlerFn = (strings: unknown, ...values: unknown[]) => {
    if (typeof strings === "string") return { type: "ident" as const, value: strings };
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
      } catch { /* skip */ }
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
  redirect: (url: string) => { mockRedirect(url); throw new Error("REDIRECT"); },
}));

const LEGACY_PORTFOLIO_CONFIG = {
  id: "a0000000-0000-0000-0000-000000000008",
  slug: "portfolio_addition",
  name: "Nieuwe portfolio toevoegen",
  description: "",
  category: "portfolio",
  cost: JSON.stringify({ baseCost: 500, costCurrency: "EUR", description: "" }),
  default_lead_days: 5,
  fields: "[]",
  stakeholders: "[]",
  workflow: "portfolio_addition",
  active: true,
  sort_order: 7,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const LIFECYCLE_UPDATE_CONFIG = {
  ...LEGACY_PORTFOLIO_CONFIG,
  id: "a0000000-0000-0000-0000-000000000012",
  slug: "portfolio_configuration_update",
  name: "Portfolio configuratie wijzigen",
};

// The seeded public client for client code ADP (see db/init.sql:
// PF-ADP-... convention — ADP is derived from the portfolio code prefix
// in the legacy flow; the admin row carries client_code ADP).
const REAL_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93"; // PF-HOR-001

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

const FUTURE_DATE = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

/**
 * Stub the DB queries for dispatchClientConfigChange (UPDATE path) and
 * capture the client_id parameter passed to the change_requests INSERT.
 *
 * INSERT column order (new-columns path, lib/db.ts saveChangeRequest):
 *   id(0), reference(1), change_type(2), change_type_id(3), client_id(4), ...
 */
function stubDb(options: { clientsLookup?: string | null } = {}) {
  onQuery(/FROM client_config\.portfolio/i, () => [
    {
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
    },
  ]);
  onQuery(/SELECT \* FROM change_type_config WHERE slug/i, (_sql, params) => {
    const slug = String(params[0] ?? "");
    if (slug === "portfolio_configuration_update") return [LIFECYCLE_UPDATE_CONFIG];
    if (slug === "portfolio_addition") return [LEGACY_PORTFOLIO_CONFIG];
    return [];
  });
  onQuery(/SELECT \* FROM change_type_config WHERE id/i, (_sql, params) => {
    const id = String(params[0] ?? "");
    if (id === "a0000000-0000-0000-0000-000000000008") return [LEGACY_PORTFOLIO_CONFIG];
    if (id === "a0000000-0000-0000-0000-000000000012") return [LIFECYCLE_UPDATE_CONFIG];
    return [];
  });
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  // getPublicClientIdByCode: SELECT id FROM clients WHERE external_reference ILIKE ...
  onQuery(/SELECT id FROM clients/i, () =>
    options.clientsLookup ? [{ id: options.clientsLookup }] : [],
  );
  onQuery(/INSERT INTO change_requests/i, () => []);
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
}

function captureClientId(handler: (clientId: string | null, changeRequestId: string | null) => void) {
  onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
    handler(String(params[4] ?? ""), String(params[0] ?? ""));
    return [];
  });
}

// ── Global hooks ────────────────────────────────────────────────────────────
beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("dispatchClientConfigChange — change_requests.client_id FK resolution", () => {
  it("passes a REAL clients.id when the client code maps to a public client row", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // The clients lookup returns a real row (PF-HOR-001 style match).
    stubDb({ clientsLookup: REAL_CLIENT_ID });
    mockRedirect.mockClear();

    let savedClientId: string | null = null;
    captureClientId((clientId) => { savedClientId = clientId; });

    const { updatePortfolioAttributeAction } = await import("@/app/admin/client-config/actions");
    try {
      await updatePortfolioAttributeAction({}, buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        column: "manager_code",
        value: "AQR",
        rationale: "FK regression test — switch manager code.",
        requestedBy: "E2E Admin",
        effectiveDate: FUTURE_DATE,
      }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    // The real clients.id must be used, not a random change-request UUID.
    expect(savedClientId).toBe(REAL_CLIENT_ID);
  });

  it("falls back to the change-request id placeholder only when no clients row matches (demo/mocked envs)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // No clients row matches → lookup returns [] → fallback placeholder.
    stubDb({ clientsLookup: null });
    mockRedirect.mockClear();

    let savedClientId: string | null = null;
    let savedChangeRequestId: string | null = null;
    captureClientId((clientId, changeRequestId) => {
      savedClientId = clientId;
      savedChangeRequestId = changeRequestId;
    });

    const { updatePortfolioAttributeAction } = await import("@/app/admin/client-config/actions");
    try {
      await updatePortfolioAttributeAction({}, buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        column: "manager_code",
        value: "AQR",
        rationale: "FK regression test — fallback path.",
        requestedBy: "E2E Admin",
        effectiveDate: FUTURE_DATE,
      }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(savedClientId).toBe(savedChangeRequestId);
  });

  it("stages DELETE (retire) with a real client id when the lookup matches", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDb({ clientsLookup: REAL_CLIENT_ID });
    mockRedirect.mockClear();

    let savedClientId: string | null = null;
    captureClientId((clientId) => { savedClientId = clientId; });

    const { deletePortfolioConfigurationAction } = await import("@/app/admin/client-config/actions");
    try {
      await deletePortfolioConfigurationAction({}, buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        rationale: "FK regression test — retire portfolio.",
        requestedBy: "E2E Admin",
        effectiveDate: FUTURE_DATE,
      }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(savedClientId).toBe(REAL_CLIENT_ID);
  });
});
