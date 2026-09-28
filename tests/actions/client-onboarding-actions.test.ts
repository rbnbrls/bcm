/**
 * Unit tests for the client onboarding server action
 * (createClientOnboardingChange — task t_7b540257).
 *
 * Covers the full submission pipeline: form data input → Zod validation →
 * asset class resolution → change type config lookup → IST/SOLL field pair
 * construction → change request persistence → redirect to the change detail
 * page. Uses a mocked DB layer (same pattern as
 * portfolio-addition-actions.test.ts) so the tests run without a real
 * database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Postgres mock (same pattern as portfolio-addition-actions.test.ts) ─────
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

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

function validFormData(overrides: Record<string, string> = {}): FormData {
  return buildMockFormData({
    clientCode: "E2E",
    clientName: "E2E Test Pensioenfonds",
    portfolioName: "Rendementsportefeuille",
    portfolioCode: "E2ERP",
    assetClassCode: "EQ",
    allocationPercentage: "100",
    ...overrides,
  });
}

/** The client_onboarding row the change_type_config queries return. */
function clientOnboardingConfigRow() {
  return [{
    id: "a0000000-0000-0000-0000-000000000011",
    slug: "client_onboarding",
    name: "Nieuwe klant (client onboarding)",
    description: "Onboard een nieuwe pensioenklant met eerste portfolio-configuratie",
    category: "client",
    fields: JSON.stringify([
      { key: "client_code", label: "Klantcode", type: "text", required: true, minLength: 1, maxLength: 3 },
      { key: "client_name", label: "Klantnaam", type: "text", required: true, minLength: 2, maxLength: 100 },
      { key: "portfolio_name", label: "Portefeuillenaam", type: "text", required: true, minLength: 2, maxLength: 100 },
      { key: "portfolio_code", label: "Portefeuillecode", type: "text", required: true, minLength: 2, maxLength: 15 },
      { key: "asset_class_code", label: "Asset class", type: "select", required: true },
      { key: "allocation_percentage", label: "Allocatiepercentage", type: "number", required: true, min: 0, max: 100 },
    ]),
    ist_soll_mapping: JSON.stringify([]),
    cost: JSON.stringify({ baseCost: 0, costCurrency: "EUR", description: "Geen kosten" }),
    default_lead_days: 1,
    stakeholders: JSON.stringify([
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit"], mandatory: true },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true },
    ]),
    workflow: "client_onboarding",
    process_flow: JSON.stringify([]),
    active: true,
    sort_order: 6,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }];
}

/** Stub the DB queries needed for a successful submission. */
function stubDbForSuccess() {
  // getClientConfigReferenceData — asset class lookup
  onQuery(/FROM client_config\.asset_class/i, () => [
    { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
  ]);
  // getChangeTypeBySlug / getChangeTypeById — client_onboarding config row
  onQuery(/FROM change_type_config/i, () => clientOnboardingConfigRow());
  onQuery(/SELECT 1 FROM change_type_config/i, () => [{ 1: 1 }]);
  // getPublicClientIdByCode — no existing legacy client for the new code
  onQuery(/SELECT id FROM clients/i, () => []);
  // resolveOnboardingClientId — placeholder clients row insert
  onQuery(/INSERT INTO clients/i, () => []);
  // saveChangeRequest
  onQuery(/INSERT INTO change_requests/i, () => []);
  onQuery(/INSERT INTO audit_log/i, () => []);
  // stagePortfolioMetadataChange (t_4fbdd465): the onboarding always stages a
  // portfolio CREATE row; the RETURNING id is needed for { ok: true }.
  onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => [{ id: 1 }]);
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

// ════════════════════════════════════════════════════════════════════════════
describe("createClientOnboardingChange server action", () => {
  it("returns validation errors for empty required fields", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    const result = await createClientOnboardingChange({}, buildMockFormData({
      clientCode: "", clientName: "", portfolioName: "", portfolioCode: "",
      assetClassCode: "", allocationPercentage: "",
    }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThan(0);
    const allErrors = result.issues!.join(" ");
    expect(allErrors).toContain("Klantcode");
    expect(allErrors).toContain("Klantnaam");
    expect(allErrors).toContain("Portefeuillenaam");
    expect(allErrors).toContain("Portefeuillecode");
    expect(allErrors).toContain("asset class");
    expect(allErrors).toContain("Allocatiepercentage");
  });

  it("rejects an asset class that does not exist in the reference data", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    onQuery(/FROM client_config\.asset_class/i, () => [
      { asset_class_id: 1, asset_class_code: "FI", asset_class_name: "FIXED INCOME" },
    ]);

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    const result = await createClientOnboardingChange({}, validFormData({ assetClassCode: "EQ" }));

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("bestaat niet in de referentiedata");
  });

  it("returns an error when the client_onboarding change type config is missing from the DB", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // getChangeTypeBySlug falls back to in-memory defaults, but saveChangeRequest
    // validates the config row itself (SELECT 1 FROM change_type_config WHERE id = ...)
    // and throws when it is genuinely missing.
    onQuery(/FROM client_config\.asset_class/i, () => [
      { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
    ]);
    onQuery(/FROM change_type_config/i, () => []);
    onQuery(/SELECT 1 FROM change_type_config/i, () => []);
    onQuery(/INSERT INTO change_requests/i, () => []);

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    const result = await createClientOnboardingChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("bestaat niet");
  });

  it("creates the change request with complete IST/SOLL fields and redirects to the change detail page", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    let savedFields: string | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p.includes('"fieldKey"')) {
          savedFields = p;
        }
      }
      return [];
    });

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");

    try {
      await createClientOnboardingChange({}, validFormData());
    } catch (e) {
      // Expected — redirect throws
    }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = String(mockRedirect.mock.calls[0][0]);
    expect(redirectUrl).toMatch(/^\/changes\/[0-9a-f-]+$/);

    // The change request payload carries all six collected fields as IST/SOLL
    // pairs: IST is null (a new client does not exist yet — CREATE semantics),
    // SOLL carries the submitted value.
    expect(savedFields).not.toBeNull();
    if (savedFields) {
      const parsed = JSON.parse(savedFields);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBe(6);
      const byKey = Object.fromEntries((parsed as Array<{ fieldKey: string; istValue: unknown; sollValue: unknown }>).map((f) => [f.fieldKey, f]));
      expect(byKey.client_code).toEqual({ fieldKey: "client_code", istValue: null, sollValue: "E2E" });
      expect(byKey.client_name).toEqual({ fieldKey: "client_name", istValue: null, sollValue: "E2E Test Pensioenfonds" });
      expect(byKey.portfolio_name).toEqual({ fieldKey: "portfolio_name", istValue: null, sollValue: "Rendementsportefeuille" });
      expect(byKey.portfolio_code).toEqual({ fieldKey: "portfolio_code", istValue: null, sollValue: "E2ERP" });
      expect(byKey.asset_class_code).toEqual({ fieldKey: "asset_class_code", istValue: null, sollValue: "EQ" });
      expect(byKey.allocation_percentage).toEqual({ fieldKey: "allocation_percentage", istValue: null, sollValue: "100" });
    }
  });

  it("creates a placeholder public clients row for a genuinely new client code", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    let insertedClient: { id: string; name: string; reference: string } | null = null;
    onQuery(/INSERT INTO clients/i, (_sql, params) => {
      insertedClient = { id: String(params[0]), name: String(params[1]), reference: String(params[2]) };
      return [];
    });

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    try {
      await createClientOnboardingChange({}, validFormData());
    } catch { /* redirect throw */ }

    expect(insertedClient).not.toBeNull();
    expect(insertedClient!.name).toBe("E2E Test Pensioenfonds");
    expect(insertedClient!.reference).toBe("PF-E2E-001");
  });

  it("reuses an existing public clients row when the client code already maps to one", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    const existingClientId = "9f9280fc-9572-49d1-b81c-2a039652bc93";
    onQuery(/SELECT id FROM clients/i, () => [{ id: existingClientId }]);

    let clientsInserted = 0;
    onQuery(/INSERT INTO clients/i, () => { clientsInserted++; return []; });

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    try {
      await createClientOnboardingChange({}, validFormData());
    } catch { /* redirect throw */ }

    expect(clientsInserted).toBe(0);
    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});
