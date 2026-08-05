/**
 * Regression tests for the remaining change_requests.client_id FK fallbacks
 * (t_d556c774 — follow-up to #525, fix PR #526).
 *
 * Two call sites still carried the identical latent bug fixed for
 * createBenchmarkChange in PR #526: when getPublicClientIdByCode finds no
 * legacy public `clients` row (external_reference convention
 * "PF-<CODE>-<NNN>"), they inserted the change request's own randomUUID as
 * change_requests.client_id, which violates the NOT NULL FK
 * change_requests_client_id_fkey on a real database.
 *
 * Fixed here (same fail-closed shape as app/changes/new/actions.ts post-#526):
 *   1) app/changes/new/portfolio-actions.ts — createPortfolioAdditionChange
 *   2) app/admin/client-config/actions.ts — dispatchClientConfigChange
 *
 * Both return a user-facing Dutch validation error when a database IS
 * available but no legacy clients row matches, instead of inserting a
 * placeholder UUID. The portfolio action keeps its `?? id` placeholder
 * fallback ONLY for no-DB demo environments (e2e submits without a database
 * and expects the graceful "Database niet bereikbaar" path there).
 *
 * Scenarios covered per call site:
 *   1) missing/malformed clientCode → validation error, no DB writes
 *   2) client code exists in client_config but has NO legacy clients row
 *      → user-facing validation error, no INSERT, no FK-violation message
 *   3) valid clients row → change request created with the real clients.id
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Admin-gate request scope ────────────────────────────────────────────────
// Both actions resolve the active role from the bcm_active_role RBAC cookie.
// createPortfolioAdditionChange needs changes:create (change_manager);
// the admin actions need admin:access (admin). Each describe sets the role
// it needs via setMockRole before importing the action.
let mockActiveRole = "change_manager";
function setMockRole(role: string) {
  mockActiveRole = role;
}
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "bcm_active_role" ? { name, value: mockActiveRole } : undefined,
  })),
}));

// ── Postgres mock (same pattern as benchmark-change-client-id-regression.test.ts) ──
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
        // skip invalid patterns
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

// Mock next/navigation redirect (both actions redirect on success).
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("REDIRECT");
  },
}));

function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
const FUTURE_DATE = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
  clearQueryHandlers();
  mockRedirect.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// createPortfolioAdditionChange (app/changes/new/portfolio-actions.ts)
// ═══════════════════════════════════════════════════════════════════════════

const VALID_PORTFOLIO_FORM = {
  portfolioCode: "ADP",
  assetClass: "EQUITIES",
  subAssetClass: "AC WORLD",
  managerCode: "ROB",
  benchmarkCode: "MSCI-WORLD-NR",
  npcClassificationId: "1",
  longName: "E2E Test Portfolio",
  shortName: "E2E-TEST",
  requestedBy: "E2E Test User",
  rationale: "E2E test — verifying portfolio addition server action end-to-end.",
  effectiveDate: FUTURE_DATE,
};

/**
 * Stub every query createPortfolioAdditionChange issues on the success path,
 * mirroring stubDbForSuccess in portfolio-addition-actions.test.ts. The
 * legacy clients lookup (getPublicClientIdByCode → "SELECT id FROM clients
 * WHERE external_reference ILIKE 'PF-<CODE>-%'") is registered via
 * clientsRows so each test controls whether a legacy clients row exists.
 */
function stubPortfolioDb(clientsRows: unknown[] = []) {
  // getClientConfigReferenceData
  onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
  onQuery(/FROM client_config\.portfolio/i, () => [
    { portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true },
  ]);
  onQuery(/FROM client_config\.asset_class/i, () => [
    { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
  ]);
  onQuery(/FROM client_config\.sub_asset_class/i, () => [
    { sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" },
  ]);
  onQuery(/FROM client_config\.manager/i, () => [
    { manager_id: 1, manager_code: "ROB", manager_name: "Robeco" },
  ]);
  onQuery(/FROM client_config\.benchmark/i, () => [
    { benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null },
  ]);
  onQuery(/FROM client_config\.npc_classification/i, () => [
    { npc_classification_id: 1, classification_name: "Pensioen" },
  ]);
  // getChangeTypeBySlug → falls back to DEFAULT catalog when DB returns []
  onQuery(/SELECT 1 FROM change_type_config WHERE id =/, () => [{ 1: 1 }]);
  // saveChangeRequest internals
  onQuery(/SELECT 1 FROM change_requests LIMIT 0/, () => []);
  onQuery(/SELECT 1 FROM audit_log LIMIT 0/, () => []);
  onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [{ cnt: 1 }]);
  onQuery(/INSERT INTO change_type_config/, () => []);
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  onQuery(/INSERT INTO change_requests/, () => []);
  // getPublicClientIdByCode → legacy public clients lookup
  onQuery(/SELECT id FROM clients/i, () => clientsRows);
  // saveChangePortfolioConfiguration
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
}

describe("createPortfolioAdditionChange — missing/invalid client_id regression (#525 follow-up)", () => {
  it("returns a validation error (not an INSERT) for a malformed clientCode", async () => {
    stubPortfolioDb();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");

    // "ABCD" is 4 chars — the portfolio schema allows 1-3 uppercase/numbers.
    const result = await createPortfolioAdditionChange(
      {},
      buildMockFormData({ ...VALID_PORTFOLIO_FORM, clientCode: "ABCD" }),
    );

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.some((issue) => issue.includes("Client code moet 1-3"))).toBe(true);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("fails closed with a user-facing validation error when no legacy clients row exists — no FK violation, no INSERT", async () => {
    stubPortfolioDb([]); // getPublicClientIdByCode → null

    let changeRequestInserted = false;
    onQuery(/INSERT INTO change_requests/, () => {
      changeRequestInserted = true;
      return [];
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");

    const result = await createPortfolioAdditionChange({}, buildMockFormData(VALID_PORTFOLIO_FORM));

    // User-facing validation error, not a raw/foreign-key failure.
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.some((issue) => issue.includes("niet geregistreerd in de klantenadministratie"))).toBe(true);
    // The pre-fix behavior returned the FK catch-all message — assert we never
    // reach that path.
    expect(result.issues!.join(" ")).not.toContain("inconsistentie");
    // No write attempt to change_requests, no redirect.
    expect(changeRequestInserted).toBe(false);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("creates the change request with the real clients.id when a valid client row exists", async () => {
    stubPortfolioDb([{ id: VALID_CLIENT_ID }]); // getPublicClientIdByCode → VALID_CLIENT_ID

    let changeRequestParams: unknown[] = [];
    onQuery(/INSERT INTO change_requests/, (_sql, params) => {
      changeRequestParams = params;
      return [];
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");

    try {
      await createPortfolioAdditionChange({}, buildMockFormData(VALID_PORTFOLIO_FORM));
    } catch {
      /* redirect throw */
    }

    // The change request was written with the resolved public clients.id —
    // not a randomUUID placeholder (the #525 FK-violation bug).
    expect(mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/changes\/[0-9a-f-]{36}$/));
    expect(changeRequestParams.some((p) => p === VALID_CLIENT_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// dispatchClientConfigChange (app/admin/client-config/actions.ts)
// ═══════════════════════════════════════════════════════════════════════════

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

/**
 * Stub the DB queries for dispatchClientConfigChange (UPDATE path via
 * updatePortfolioAttributeAction), mirroring client-config-fk-client-id.test.ts.
 */
function stubAdminDb(options: { clientsLookup?: string | null } = {}) {
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
  // getPublicClientIdByCode → legacy public clients lookup
  onQuery(/SELECT id FROM clients/i, () =>
    options.clientsLookup ? [{ id: options.clientsLookup }] : [],
  );
  onQuery(/INSERT INTO change_requests/i, () => []);
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
}

function captureAdminClientId(handler: (clientId: string | null, changeRequestId: string | null) => void) {
  onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
    handler(String(params[4] ?? ""), String(params[0] ?? ""));
    return [];
  });
}

describe("dispatchClientConfigChange — change_requests.client_id FK regression (#525 follow-up)", () => {
  beforeEach(() => {
    setMockRole("admin");
  });

  it("returns a validation error for a malformed clientCode in the update wizard — no INSERT", async () => {
    const { updateClientConfigRowAction } = await import("@/app/admin/client-config/actions");

    const result = await updateClientConfigRowAction(
      {},
      buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        requestedBy: "E2E Admin",
        rationale: "Acceptance test — update this portfolio config.",
        effectiveDate: FUTURE_DATE,
        portfolioCode: "ADP",
        clientCode: "", // empty string fails the min(1) "Klantcode is verplicht." rule
        assetClassCode: "EQ",
        subAssetClassCode: "ACX",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: "1",
        longName: "E2E Portfolio",
        shortName: "E2E-PF",
      }),
    );

    expect(result.issues).toBeDefined();
    expect(result.issues!.join(" ")).toContain("Klantcode is verplicht");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("fails closed with a user-facing validation error when no legacy clients row exists — no FK violation, no INSERT", async () => {
    stubAdminDb({ clientsLookup: null }); // getPublicClientIdByCode → null

    let changeRequestInserted = false;
    onQuery(/INSERT INTO change_requests/, () => {
      changeRequestInserted = true;
      return [];
    });

    const { updatePortfolioAttributeAction } = await import("@/app/admin/client-config/actions");

    const result = await updatePortfolioAttributeAction(
      {},
      buildMockFormData({
        primaryAccountId: "ADP*EQACX*ROB",
        column: "manager_code",
        value: "AQR",
        rationale: "FK regression test — fail-closed path.",
        requestedBy: "E2E Admin",
        effectiveDate: FUTURE_DATE,
      }),
    );

    // User-facing validation error, not a raw/foreign-key failure.
    expect(result.issues).toBeDefined();
    expect(result.issues!.some((issue) => issue.includes("niet geregistreerd in de klantenadministratie"))).toBe(true);
    expect(result.issues!.join(" ")).not.toContain("inconsistentie");
    // No write attempt to change_requests, no redirect.
    expect(changeRequestInserted).toBe(false);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes the REAL clients.id when the client code maps to a public client row", async () => {
    stubAdminDb({ clientsLookup: VALID_CLIENT_ID });

    let savedClientId: string | null = null;
    captureAdminClientId((clientId) => { savedClientId = clientId; });

    const { updatePortfolioAttributeAction } = await import("@/app/admin/client-config/actions");

    try {
      await updatePortfolioAttributeAction(
        {},
        buildMockFormData({
          primaryAccountId: "ADP*EQACX*ROB",
          column: "manager_code",
          value: "AQR",
          rationale: "FK regression test — real client id path.",
          requestedBy: "E2E Admin",
          effectiveDate: FUTURE_DATE,
        }),
      );
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    // The real clients.id must be used, not a random change-request UUID.
    expect(savedClientId).toBe(VALID_CLIENT_ID);
  });
});
