/**
 * Unit tests for deletePortfolioConfigurationAction — the governed DELETE
 * (retire) staging action for the admin client-config table (t_eea817b3).
 *
 * Acceptance criteria pinned here:
 *  - Calling the action with a portfolio configuration ID, requester,
 *    rationale and effective date creates a pending change request record
 *    with type DELETE (change_type portfolio_configuration_retire, staged
 *    action_type DELETE) carrying the provided metadata.
 *  - The staged row identifies the target by the stable config identity
 *    (primaryAccountId / target_primary_account_id).
 *  - The action never mutates the live portfolio_configuration table
 *    directly — only the change-management staging tables are written.
 *  - Invalid input, unknown targets and past effective dates are rejected
 *    without staging anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Postgres mock (same pattern as client-config-update-row-action.test.ts) ──
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
const PAST_DATE = new Date(Date.now() - 30 * 86400000)
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

/** Stub the DB so deletePortfolioConfigurationAction can run end to end. */
function stubDb(options: { row?: typeof EXISTING_ROW | null } = {}) {
  const row = options.row === undefined ? EXISTING_ROW : options.row;
  onQuery(/FROM client_config\.portfolio/i, () => (row ? [row] : []));
  onQuery(/SELECT \* FROM change_type_config WHERE slug/i, (_sql, params) => {
    return String(params[0]) === RETIRE_CONFIG.slug ? [RETIRE_CONFIG] : [];
  });
  onQuery(/SELECT \* FROM change_type_config WHERE id/i, (_sql, params) => {
    return String(params[0]) === RETIRE_CONFIG.id ? [RETIRE_CONFIG] : [];
  });
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  // getPublicClientIdByCode: SELECT id FROM clients WHERE external_reference ILIKE ...
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

/**
 * Assert that no query mutated the live portfolio_configuration table.
 * The staging tables (change_requests, change_portfolio_configuration) are
 * allowed — the live config table is not.
 */
function expectNoDirectMutation() {
  const liveWrites = unmatchedSqlLog.filter((sql) =>
    /(INSERT INTO|UPDATE|DELETE FROM)\s+client_config\.portfolio_configuration\b/i.test(
      sql,
    ),
  );
  expect(liveWrites).toEqual([]);
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

describe("deletePortfolioConfigurationAction — governed DELETE staging", () => {
  it("stages a pending change request with type DELETE and the provided metadata", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDb();
    mockRedirect.mockClear();

    // Captured params follow the change_requests INSERT column order:
    // id, reference, change_type, change_type_id, client_id, requested_by,
    // rationale, effective_date, (literal 'submitted'), sla_lead_weeks,
    // (now()), (now()), fields, stakeholders, estimated_cost, ...,
    let saved: Record<string, unknown> | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      saved = {
        changeType: params[2],
        changeTypeId: params[3],
        clientId: params[4],
        requestedBy: params[5],
        rationale: params[6],
        effectiveDate: params[7],
        slaLeadWeeks: params[8],
        fields: params[9],
      };
      return [];
    });

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

    // The action redirects to the changes list after a successful dispatch.
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/changes");

    // ── Change request record: type DELETE + provided metadata ──────────────
    expect(saved).not.toBeNull();
    expect(saved!.changeType).toBe("portfolio_configuration_retire");
    expect(saved!.changeTypeId).toBe(RETIRE_CONFIG.id);
    expect(saved!.requestedBy).toBe("E2E Admin");
    expect(saved!.rationale).toBe(
      "Acceptance test — retire this portfolio config.",
    );
    expect(saved!.effectiveDate).toBe(FUTURE_DATE);

    // The fields payload records action_type DELETE and the stable target
    // identity (primary_account_id, IST = SOLL = the config row key).
    const fields = JSON.parse(String(saved!.fields)) as Array<{
      fieldKey: string;
      istValue: unknown;
      sollValue: unknown;
    }>;
    const byKey = Object.fromEntries(fields.map((f) => [f.fieldKey, f]));
    expect(byKey["action_type"].istValue).toBeNull();
    expect(byKey["action_type"].sollValue).toBe("DELETE");
    expect(byKey["primary_account_id"].istValue).toBe("ADP*EQACX*ROB");
    expect(byKey["primary_account_id"].sollValue).toBe("ADP*EQACX*ROB");

    // ── Staged row: DELETE with stable target identity ──────────────────────
    expect(staged).not.toBeNull();
    expect(staged!.actionType).toBe("DELETE");
    expect(staged!.targetPrimaryAccountId).toBe("ADP*EQACX*ROB");
    expect(staged!.effectiveFrom).toBe(FUTURE_DATE);

    // ── No direct mutation of the live configuration table ──────────────────
    expectNoDirectMutation();
  });

  it("returns validation errors without staging when a required field is missing or invalid", async () => {
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

    const { deletePortfolioConfigurationAction } =
      await import("@/app/admin/client-config/actions");
    const result = await deletePortfolioConfigurationAction(
      {},
      deleteFormData({
        rationale: "te kort", // below min 10 chars
        effectiveDate: "", // required date missing
      }),
    );

    expect(result.success).toBe(false);
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(result.issues!.some((i) => i.includes("10 tekens"))).toBe(true);
    expect(dispatchCount).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("rejects an unknown primaryAccountId without staging", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDb({ row: null });

    let dispatchCount = 0;
    onQuery(
      /INSERT INTO client_config\.change_portfolio_configuration/i,
      () => {
        dispatchCount++;
        return [{ id: 1 }];
      },
    );

    const { deletePortfolioConfigurationAction } =
      await import("@/app/admin/client-config/actions");
    const result = await deletePortfolioConfigurationAction(
      {},
      deleteFormData({ primaryAccountId: "XXX*YY*ZZZ" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("bestaat niet");
    expect(dispatchCount).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("rejects a past effective date without staging", async () => {
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

    const { deletePortfolioConfigurationAction } =
      await import("@/app/admin/client-config/actions");
    const result = await deletePortfolioConfigurationAction(
      {},
      deleteFormData({ effectiveDate: PAST_DATE }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("verleden");
    expect(dispatchCount).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
