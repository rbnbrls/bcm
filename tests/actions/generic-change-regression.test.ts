/**
 * Regression tests for the create-generic-change flow.
 *
 * Added for bug report: verify behavior when a non-existent/missing or invalid
 * change type config ID is provided to create-generic-change. Expects user-facing
 * issue output rather than raw DB/server errors.
 *
 * Scenarios covered:
 * 1) Config missing from DB / unknown slug
 * 2) Invalid config id explicitly rejected
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

const VALID_CHANGE_TYPE_ID = "a0000000-0000-0000-0000-000000000001";
const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
const FUTURE_DATE = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
  clearQueryHandlers();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubDbForSuccess(options: { changeTypeExists?: boolean } = {}) {
  const { changeTypeExists = true } = options;
  onQuery(/SELECT 1 FROM change_requests LIMIT 0/, () => []);
  onQuery(/SELECT 1 FROM audit_log LIMIT 0/, () => []);
  onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [
    { cnt: changeTypeExists ? 3 : 0 },
  ]);
  onQuery(/INSERT INTO change_type_config/, () => []);
  onQuery(/SELECT \* FROM change_type_config WHERE id = .* LIMIT 1/, (_sql, params) => {
    const id = typeof params[0] === "string" ? params[0] : String(_sql).match(/WHERE id = '([^']+)'/)?.[1] ?? "";
    if (!id) return [];
    const valid = {
      id: "a0000000-0000-0000-0000-000000000001",
      slug: "benchmark_switch",
      name: "Benchmarkwissel",
      description: "",
      category: "general",
      cost: { baseCost: 0, costCurrency: "EUR", description: "", perItemCost: 0 },
      defaultLeadDays: 1,
      fields: [{ key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" }],
      stakeholders: [],
      workflow: "default",
      active: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (id === valid.id) return [valid];
    return [];
  });
  onQuery(/SELECT \* FROM clients LIMIT 1/, () => []);
  onQuery(/FROM clients c/, () => [
    {
      client_id: VALID_CLIENT_ID,
      client_name: "Regression Klant",
      client_reference: "REG01",
      client_asset_class: null,
      portfolio_id: null,
      portfolio_name: null,
      portfolio_reference: null,
      portfolio_current_benchmark_id: null,
      wtp_id: null,
      wtp_name: null,
      ac_id: null,
      ac_name: null,
      m_id: null,
      m_name: null,
      bg_id: null,
      bg_name: null,
    },
  ]);
  onQuery(/SELECT sla_lead_weeks FROM change_requests LIMIT 0/, () => []);
  onQuery(/INSERT INTO change_requests/, () => []);
  onQuery(/INSERT INTO change_request_items/, () => []);
  onQuery(/INSERT INTO audit_log/, () => []);
}

describe("createGenericChangeRequest — missing/invalid change_type_config regression", () => {
  it("rejects a configured but inactive change type before saving", async () => {
    onQuery(/SELECT \* FROM change_type_config WHERE slug = .* LIMIT 1/, () => [
      {
        id: VALID_CHANGE_TYPE_ID,
        slug: "benchmark_switch",
        name: "Benchmarkwissel",
        description: "",
        category: "general",
        cost: JSON.stringify({ baseCost: 0, costCurrency: "EUR", description: "", perItemCost: 0 }),
        default_lead_days: 1,
        fields: JSON.stringify([]),
        stakeholders: JSON.stringify([]),
        workflow: "default",
        process_flow: JSON.stringify([]),
        active: false,
        sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const { createGenericChangeRequest } = await import("@/app/changes/new/generic-actions");

    const result = await createGenericChangeRequest(
      { issues: [] },
      buildMockFormData({
        changeTypeSlug: "benchmark_switch",
        clientId: VALID_CLIENT_ID,
        requestedBy: "Regression Aanvrager",
        rationale: "Regression test inactive config path in create-generic-change.",
        effectiveDate: FUTURE_DATE,
      }),
    );

    expect(result.issues).toBeDefined();
    expect(result.issues!.some((issue) => issue.includes("gedeactiveerd"))).toBe(true);
  });

  it("returns a user-facing issue when a missing config slug is provided", async () => {
    stubDbForSuccess({ changeTypeExists: false });
    const { createGenericChangeRequest } = await import("@/app/changes/new/generic-actions");

    const result = await createGenericChangeRequest(
      { issues: [] },
      buildMockFormData({
        changeTypeSlug: "does_not_exist",
        clientId: VALID_CLIENT_ID,
        requestedBy: "Regression Aanvrager",
        rationale: "Regression test missing config path in create-generic-change.",
        effectiveDate: FUTURE_DATE,
      }),
    );

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.some((issue) => issue.includes("bestaat niet"))).toBe(true);
  });

  it("returns a clear user-facing issue when an invalid change type config ID is submitted", async () => {
    onQuery(/SELECT \* FROM change_type_config WHERE id = .* LIMIT 1/, () => []);

    const { createGenericChangeRequest } = await import("@/app/changes/new/generic-actions");

    const result = await createGenericChangeRequest(
      { issues: [] },
      buildMockFormData({
        changeTypeSlug: "benchmark_switch",
        clientId: VALID_CLIENT_ID,
        requestedBy: "Regression Aanvrager",
        rationale: "Regression test invalid config ID path in create-generic-change.",
        effectiveDate: FUTURE_DATE,
      }),
    );

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.some((issue) => issue.includes("bestaat niet"))).toBe(true);
  });

  it("resolves and accepts a valid canonical change type config id for the known slug path", async () => {
    const { getChangeTypeBySlug } = await import("@/lib/db");
    const cfg = await getChangeTypeBySlug("benchmark_switch");
    expect(cfg).not.toBeNull();
    expect(cfg!.id).toBe(VALID_CHANGE_TYPE_ID);
  });
});
