/**
 * Backward-compatibility tests for the admin client-config dispatch path
 * (dispatchClientConfigChange in app/admin/client-config/actions.ts).
 *
 * The admin UPDATE/DELETE actions stage changes under the explicit lifecycle
 * slugs (portfolio_configuration_update / portfolio_configuration_retire).
 * Until those slugs are seeded in the change type catalog, resolution must
 * fall back to the legacy portfolio_addition slug so existing flows keep
 * working and no request is lost.
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
vi.mock("@/lib/identity/request", () => ({
  getIdentityContext: vi.fn(async () => ({ userId: "admin-test", displayName: "Test Admin", groups: ["bcm:role:admin"], tenant: "test", businessUnit: "test", sessionId: "admin-session" })),
}));

// ── Postgres mock (same pattern as portfolio-addition.test.ts) ─────────────
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
 * Stub the DB so updatePortfolioAttributeAction can run:
 * existing row lookup + change type config by slug + change request save.
 * `slugHandler` controls which config a given slug lookup returns (by param).
 */
function stubDb(slugHandler: (slug: string) => unknown[] | null) {
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
    const result = slugHandler(slug);
    return result ?? [];
  });
  onQuery(/SELECT \* FROM change_type_config WHERE id/i, (_sql, params) => {
    const id = String(params[0] ?? "");
    if (id === "a0000000-0000-0000-0000-000000000008") return [LEGACY_PORTFOLIO_CONFIG];
    if (id === "a0000000-0000-0000-0000-000000000012") return [LIFECYCLE_UPDATE_CONFIG];
    return [];
  });
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  // getPublicClientIdByCode: a legacy clients row must exist for the FK
  // (fail-closed regression t_d556c774).
  onQuery(/SELECT id FROM clients/i, () => [
    { id: "9f9280fc-9572-49d1-b81c-2a039652bc93" },
  ]);
  onQuery(/INSERT INTO change_requests/i, () => []);
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
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

describe("dispatchClientConfigChange — backward-compatible slug resolution", () => {
  it("stages UPDATE under portfolio_configuration_update even when the DB lacks the row (default-catalog fallback)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // The DB does not yet contain the portfolio_configuration_update row, but
    // the slug is part of DEFAULT_CHANGE_TYPE_CONFIGS — getChangeTypeBySlug
    // falls back to the defaults, so the explicit lifecycle slug is used.
    stubDb((slug) => (slug === "portfolio_addition" ? [LEGACY_PORTFOLIO_CONFIG] : null));
    mockRedirect.mockClear();

    let savedChangeType: string | null = null;
    let savedChangeTypeId: string | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p === "portfolio_configuration_update") savedChangeType = p;
        if (typeof p === "string" && p === "a0000000-0000-0000-0000-000000000013") savedChangeTypeId = p;
      }
      return [];
    });

    const { updatePortfolioAttributeAction } = await import("@/app/admin/client-config/actions");
    try {
      await updatePortfolioAttributeAction({}, buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        column: "manager_code",
        value: "AQR",
        rationale: "Backward compat test — switch manager code.",
        requestedBy: "E2E Admin",
        effectiveDate: FUTURE_DATE,
      }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    // The explicit lifecycle slug resolves via the default catalog, so the
    // request is staged under portfolio_configuration_update — the documented
    // auto-switch once seeding lands.
    expect(savedChangeType).toBe("portfolio_configuration_update");
    expect(savedChangeTypeId).toBe("a0000000-0000-0000-0000-000000000013");
  });

  it("uses portfolio_configuration_update once it is seeded in the catalog", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // Both slugs resolve; the explicit lifecycle slug takes precedence.
    stubDb((slug) =>
      slug === "portfolio_configuration_update"
        ? [LIFECYCLE_UPDATE_CONFIG]
        : slug === "portfolio_addition"
          ? [LEGACY_PORTFOLIO_CONFIG]
          : null,
    );
    mockRedirect.mockClear();

    let savedChangeType: string | null = null;
    let savedChangeTypeId: string | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p === "portfolio_configuration_update") savedChangeType = p;
        if (typeof p === "string" && p === "a0000000-0000-0000-0000-000000000012") savedChangeTypeId = p;
      }
      return [];
    });

    const { updatePortfolioAttributeAction } = await import("@/app/admin/client-config/actions");
    try {
      await updatePortfolioAttributeAction({}, buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        column: "manager_code",
        value: "AQR",
        rationale: "Lifecycle slug test — switch manager code.",
        requestedBy: "E2E Admin",
        effectiveDate: FUTURE_DATE,
      }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(savedChangeType).toBe("portfolio_configuration_update");
    expect(savedChangeTypeId).toBe("a0000000-0000-0000-0000-000000000012");
  });

  it("stages DELETE under portfolio_configuration_retire now that it is seeded in the default catalog", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // The DB lacks the retire row, but the slug is part of
    // DEFAULT_CHANGE_TYPE_CONFIGS, so resolution returns the explicit slug.
    stubDb((slug) => (slug === "portfolio_addition" ? [LEGACY_PORTFOLIO_CONFIG] : null));
    mockRedirect.mockClear();

    let savedChangeType: string | null = null;
    let savedChangeTypeId: string | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p === "portfolio_configuration_retire") savedChangeType = p;
        if (typeof p === "string" && p === "a0000000-0000-0000-0000-000000000014") savedChangeTypeId = p;
      }
      return [];
    });

    const { deletePortfolioConfigurationAction } = await import("@/app/admin/client-config/actions");
    try {
      await deletePortfolioConfigurationAction({}, buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        rationale: "Backward compat test — retire portfolio.",
        requestedBy: "E2E Admin",
        effectiveDate: FUTURE_DATE,
      }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(savedChangeType).toBe("portfolio_configuration_retire");
    expect(savedChangeTypeId).toBe("a0000000-0000-0000-0000-000000000014");
  });
});
