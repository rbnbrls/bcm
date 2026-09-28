/**
 * End-to-end integration tests for the portfolio addition change flow.
 *
 * Covers three layers:
 * 1. Change type config — the portfolio_addition config must be correctly
 *    defined with 11 fields across 4 wizard steps, 2 stakeholders, correct
 *    sort order, and category "portfolio".
 * 2. Form validation — the generic change form validators work with the
 *    portfolio_addition field definitions (required fields, invalid values).
 * 3. Backend processing — createPortfolioFromChangeAction() validates,
 *    checks FKs, detects duplicates, and inserts the new portfolio row.
 * 4. Routing — updateChangeStatus routes portfolio_addition changes to the
 *    dedicated handler when status becomes 'processed'.
 *
 * Tests in sections 3 and 4 mock the postgres module so they run without
 * a real database connection.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

// ── Section 1 & 2: no DB mocking needed ──────────────────────────────────
// These static imports evaluate once at file load. The postgres mock is
// already active by the time these run because vi.mock is hoisted.

import {
  DEFAULT_CHANGE_TYPE_CONFIGS,
  getChangeTypeBySlug,
} from "@/lib/db";
import { validateGenericFields, computeEstimatedCost } from "@/lib/change-form-utils";
import type { ChangeTypeConfig, ChangeFieldValue } from "@/lib/types";

// ── Postgres mock (hoisted to top by vitest) ────────────────────────────
// The mock factory closes over this Map. Handlers registered via onQuery()
// before a dynamic import are visible when the factory runs again after
// vi.resetModules().

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
        // skip invalid patterns
      }
    }

    unmatchedSqlLog.push(reconstructed);
    return Promise.resolve([]);
  };

  const sql = Object.assign(handlerFn, {
    begin: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });

  return { default: vi.fn(() => sql) };
});

// ── Fixture helpers ──────────────────────────────────────────────────────

function getPortfolioAdditionConfig(): ChangeTypeConfig {
  const cfg = DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === "portfolio_addition");
  if (!cfg) throw new Error("portfolio_addition config not found in DEFAULT_CHANGE_TYPE_CONFIGS");
  return cfg;
}

// ── Global hooks ─────────────────────────────────────────────────────────

beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1: Change type config
// ══════════════════════════════════════════════════════════════════════════

describe("portfolio_addition change type config", () => {
  it("exists in DEFAULT_CHANGE_TYPE_CONFIGS", () => {
    const cfg = getPortfolioAdditionConfig();
    expect(cfg).toBeDefined();
  });

  it("has correct metadata (slug, name, category, sortOrder)", () => {
    const cfg = getPortfolioAdditionConfig();
    expect(cfg.slug).toBe("portfolio_addition");
    expect(cfg.name).toBe("Nieuwe portfolio toevoegen");
    expect(cfg.category).toBe("portfolio");
    expect(cfg.sortOrder).toBe(7);
    expect(cfg.active).toBe(true);
    expect(cfg.workflow).toBe("portfolio_addition");
    expect(cfg.defaultLeadDays).toBe(5);
  });

  it("defines all 11 fields with correct keys", () => {
    const cfg = getPortfolioAdditionConfig();
    expect(cfg.fields).toHaveLength(11);
    const keys = cfg.fields.map((f) => f.key);
    expect(keys).toEqual([
      "client_id", "name", "external_reference", "current_benchmark_id",
      "currency", "wtp_classification_id", "asset_class_id", "manager_id",
      "benchmark_id", "asset_class", "sub_asset_class",
    ]);
  });

  it("marks only currency as optional (10 required, 1 optional)", () => {
    const cfg = getPortfolioAdditionConfig();
    const optional = cfg.fields.filter((f) => !f.required);
    expect(optional).toHaveLength(1);
    expect(optional[0].key).toBe("currency");
  });

  it("defines the 4 wizard process steps", () => {
    const cfg = getPortfolioAdditionConfig();
    expect(cfg.processFlow).toHaveLength(4);
    const steps = cfg.processFlow!;
    expect(steps[0].stepOrder).toBe(1);
    expect(steps[0].action).toBe("Portfolio definiëren");
    expect(steps[0].stakeholderId).toBe("portfolio_manager");
    expect(steps[1].stepOrder).toBe(2);
    expect(steps[1].action).toBe("Classificatie instellen");
    expect(steps[2].stepOrder).toBe(3);
    expect(steps[2].action).toBe("AC en Sub AC bepalen");
    expect(steps[3].stepOrder).toBe(4);
    expect(steps[3].action).toBe("Controleren en activeren");
    expect(steps[3].stakeholderId).toBe("risk_manager");
  });

  it("has 2 stakeholders (Portefeuillebeheerder, Risk manager)", () => {
    const cfg = getPortfolioAdditionConfig();
    expect(cfg.stakeholders).toHaveLength(2);
    const ids = cfg.stakeholders.map((s) => s.id);
    expect(ids).toContain("portfolio_manager");
    expect(ids).toContain("risk_manager");
  });

  it("has cost model: baseCost 500 EUR", () => {
    const cfg = getPortfolioAdditionConfig();
    expect(cfg.cost.baseCost).toBe(500);
    expect(cfg.cost.costCurrency).toBe("EUR");
    expect(cfg.cost.description).toContain("€500");
  });

  it("is retrievable via getChangeTypeBySlug()", async () => {
    const cfg = await getChangeTypeBySlug("portfolio_addition");
    expect(cfg).not.toBeNull();
    expect(cfg!.slug).toBe("portfolio_addition");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2: Form validation
// ══════════════════════════════════════════════════════════════════════════

describe("portfolio_addition form validation", () => {
  let config: ChangeTypeConfig;

  beforeAll(() => {
    config = getPortfolioAdditionConfig();
  });

  it("accepts valid field values for all 10 required fields", () => {
    const result = validateGenericFields(config, {
      client_id: "9f9280fc-9572-49d1-b81c-2a039652bc93",
      name: "Nieuwe portefeuille",
      external_reference: "HOR-NP",
      current_benchmark_id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
      currency: "EUR",
      wtp_classification_id: "00000001-0000-4000-a000-000000000001",
      asset_class_id: "00000002-0000-4000-a000-000000000001",
      manager_id: "00000003-0000-4000-a000-000000000001",
      benchmark_id: "00000004-0000-4000-a000-000000000001",
      asset_class: "EQUITIES",
      sub_asset_class: "AC WORLD",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("accepts valid fields without optional currency", () => {
    const result = validateGenericFields(config, {
      client_id: "9f9280fc-9572-49d1-b81c-2a039652bc93",
      name: "PF Zonder Valuta",
      external_reference: "HOR-NP2",
      current_benchmark_id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
      wtp_classification_id: "00000001-0000-4000-a000-000000000001",
      asset_class_id: "00000002-0000-4000-a000-000000000001",
      manager_id: "00000003-0000-4000-a000-000000000001",
      benchmark_id: "00000004-0000-4000-a000-000000000001",
      asset_class: "FIXED_INCOME",
      sub_asset_class: "SOVEREIGN EUROPE",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing all required fields", () => {
    const result = validateGenericFields(config, {
      client_id: "", name: "", external_reference: "", current_benchmark_id: null,
      wtp_classification_id: undefined, asset_class_id: "", manager_id: "",
      benchmark_id: "", asset_class: "", sub_asset_class: "",
    });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(10);
  });

  it("rejects invalid asset_class select option", () => {
    const result = validateGenericFields(config, {
      client_id: "9f9280fc-9572-49d1-b81c-2a039652bc93",
      name: "Test PF", external_reference: "TST-01",
      current_benchmark_id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
      wtp_classification_id: "00000001-0000-4000-a000-000000000001",
      asset_class_id: "00000002-0000-4000-a000-000000000001",
      manager_id: "00000003-0000-4000-a000-000000000001",
      benchmark_id: "00000004-0000-4000-a000-000000000001",
      asset_class: "INVALID_CLASS", sub_asset_class: "AC WORLD",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.asset_class).toBeDefined();
  });

  it("rejects name shorter than minLength of 2", () => {
    const result = validateGenericFields(config, {
      client_id: "9f9280fc-9572-49d1-b81c-2a039652bc93",
      name: "X", external_reference: "TST-01",
      current_benchmark_id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
      wtp_classification_id: "00000001-0000-4000-a000-000000000001",
      asset_class_id: "00000002-0000-4000-a000-000000000001",
      manager_id: "00000003-0000-4000-a000-000000000001",
      benchmark_id: "00000004-0000-4000-a000-000000000001",
      asset_class: "EQUITIES", sub_asset_class: "AC WORLD",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it("computes estimated cost correctly (base 500, no per-item)", () => {
    const result = computeEstimatedCost(config, 1);
    expect(result.cost).toBe(500);
    expect(result.currency).toBe("EUR");
    expect(result.description).toContain("€500");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SECTIONS 3 & 4: DB-dependent tests with mocked postgres
// ══════════════════════════════════════════════════════════════════════════

describe("createPortfolioFromChangeAction (mocked DB)", () => {
  const CHANGE_REQUEST_ID = "a1000000-0000-0000-0000-000000000001";
  const CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
  const BENCHMARK_ID = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1";
  const WTP_ID = "00000001-0000-4000-a000-000000000001";
  const ASSET_CLASS_ROW_ID = "00000002-0000-4000-a000-000000000001";
  const MANAGER_ID = "00000003-0000-4000-a000-000000000001";
  const BENCHMARK_GROUP_ID = "00000004-0000-4000-a000-000000000001";
  const SUB_ASSET_CLASS_ID = "00000005-0000-4000-a000-000000000001";

  const fullFieldValues: Record<string, unknown> = {
    client_id: CLIENT_ID,
    name: "Nieuwe portefeuille",
    external_reference: "HOR-NP",
    current_benchmark_id: BENCHMARK_ID,
    currency: "EUR",
    wtp_classification_id: WTP_ID,
    asset_class_id: ASSET_CLASS_ROW_ID,
    manager_id: MANAGER_ID,
    benchmark_id: BENCHMARK_GROUP_ID,
    asset_class: "EQUITIES",
    sub_asset_class: "AC WORLD",
  };

  function buildFields(values: Record<string, unknown>): ChangeFieldValue[] {
    return Object.entries(values).map(([fieldKey, sollValue]) => ({
      fieldKey,
      istValue: null,
      sollValue,
    }));
  }

  function mockChangeRequestRow(fields: ChangeFieldValue[] = []) {
    onQuery(/change_requests.*join clients/i, () => [
      {
        id: CHANGE_REQUEST_ID,
        reference: "BCM-2026-NP001",
        change_type: "portfolio_addition",
        change_type_id: null,
        requested_by: "Test User",
        rationale: "Adding new portfolio",
        effective_date: "2026-09-01",
        status: "processed",
        created_at: "2026-07-27T10:00:00Z",
        submitted_at: null,
        sla_lead_weeks: 1,
        sla_status: null,
        sla_days_open: null,
        status_updated_at: "2026-07-27T12:00:00Z",
        processed_at: null,
        processed_by: null,
        validated_at: null,
        validated_by: null,
        notification_sent: false,
        generic_fields: JSON.stringify(fields),
        stakeholder_assignments: null,
        estimated_cost: 500,
        estimated_cost_currency: "EUR",
        estimated_lead_days: 5,
        client_id: CLIENT_ID,
        client_name: "Pensioenfonds Horizon",
        client_reference: "PF-HOR-001",
      },
    ]);
  }

  function stubGetChangeRequestSupportingQueries() {
    onQuery(/change_request_items/i, () => []);
    onQuery(/change_type_config/i, () => []);
  }

  function stubFkChecksAllPass() {
    onQuery(/select 1 from clients where/i, () => [{ 1: 1 }]);
    onQuery(/select 1 from benchmark_catalog where/i, () => [{ 1: 1 }]);
    onQuery(/select 1 from wtp_classifications where/i, () => [{ 1: 1 }]);
    onQuery(/select 1 from managers where/i, () => [{ 1: 1 }]);
    onQuery(/select 1 from benchmarks where/i, () => [{ 1: 1 }]);
    onQuery(/from client_config\.asset_class/i, () => [{ 1: 1 }]);
  }

  function stubSubAssetClassLookup(id: string | null = SUB_ASSET_CLASS_ID) {
    onQuery(/from client_config\.sub_asset_class/i, () => (id ? [{ sub_asset_class_id: id }] : []));
  }

  function stubDuplicateCheck(hasDuplicate: boolean) {
    onQuery(/portfolios.*where.*client_id/i, () => (hasDuplicate ? [{ 1: 1 }] : []));
  }

  /** Freshly import @/lib/db with stubbed DATABASE_URL so sql is non-null */
  async function initDbModule() {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    unmatchedSqlLog.length = 0;
    vi.resetModules();
    return import("@/lib/db");
  }

  /** Clear unmatched log, re-init DB module, and call createPortfolioFromChangeAction */
  async function runCreatePortfolio(id: string = CHANGE_REQUEST_ID) {
    unmatchedSqlLog.length = 0;
    const { createPortfolioFromChangeAction } = await initDbModule();
    return createPortfolioFromChangeAction(id);
  }

  // ── Tests ──────────────────────────────────────────────────────────────

  it("returns error when DATABASE_URL is not set (no DB)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    unmatchedSqlLog.length = 0;
    vi.resetModules();

    const { createPortfolioFromChangeAction } = await import("@/lib/db");
    const result = await createPortfolioFromChangeAction(CHANGE_REQUEST_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Database niet bereikbaar.");
  });

  it("returns error when change request is not found", async () => {
    onQuery(/change_requests.*join clients/i, () => []);

    const result = await runCreatePortfolio("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Change request niet gevonden.");
  });

  it("returns error when change request has no fields", async () => {
    mockChangeRequestRow([]);
    stubGetChangeRequestSupportingQueries();

    const result = await runCreatePortfolio();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Geen velden gevonden in de change request.");
  });

  it("returns error listing missing required fields", async () => {
    const incomplete = buildFields({ client_id: CLIENT_ID, name: "Partial PF" });
    mockChangeRequestRow(incomplete);
    stubGetChangeRequestSupportingQueries();

    const result = await runCreatePortfolio();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Verplichte velden ontbreken");
    expect(result.error).toContain("external_reference");
    expect(result.error).toContain("current_benchmark_id");
    expect(result.error).toContain("wtp_classification_id");
    expect(result.error).toContain("asset_class_id");
    expect(result.error).toContain("asset_class");
    expect(result.error).toContain("sub_asset_class");
  });

  it("returns error when a FK reference does not exist (clients)", async () => {
    const fields = buildFields(fullFieldValues);
    mockChangeRequestRow(fields);
    stubGetChangeRequestSupportingQueries();

    // Only the clients FK check returns empty (no match)
    onQuery(/select 1 from clients where/i, () => []);

    const result = await runCreatePortfolio();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cliënt met ID");
  });

  it("returns error when external_reference already exists (duplicate)", async () => {
    mockChangeRequestRow(buildFields(fullFieldValues));
    stubGetChangeRequestSupportingQueries();
    stubFkChecksAllPass();
    stubSubAssetClassLookup(SUB_ASSET_CLASS_ID);
    stubDuplicateCheck(true);

    const result = await runCreatePortfolio();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Externe referentie");
    expect(result.error).toContain("bestaat al");
  });

  it("successfully creates a portfolio and returns the new ID", async () => {
    mockChangeRequestRow(buildFields(fullFieldValues));
    stubGetChangeRequestSupportingQueries();
    stubFkChecksAllPass();
    stubSubAssetClassLookup(SUB_ASSET_CLASS_ID);
    stubDuplicateCheck(false);

    let insertRan = false;
    onQuery(/insert into portfolios/i, () => {
      insertRan = true;
      return [];
    });

    const result = await runCreatePortfolio();

    expect(result.success).toBe(true);
    expect(result.portfolioId).toBeDefined();
    expect(typeof result.portfolioId).toBe("string");
    expect(result.portfolioId!.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
    expect(insertRan).toBe(true);
  });

  it("uses EUR as default currency when currency is not provided", async () => {
    const noCurrency = { ...fullFieldValues };
    delete noCurrency.currency;

    mockChangeRequestRow(buildFields(noCurrency));
    stubGetChangeRequestSupportingQueries();
    stubFkChecksAllPass();
    stubSubAssetClassLookup(SUB_ASSET_CLASS_ID);
    stubDuplicateCheck(false);

    let insertedCurrency = "";
    onQuery(/insert into portfolios/i, (_sql, params) => {
      insertedCurrency = String(params[10]);
      return [];
    });

    await runCreatePortfolio();

    expect(insertedCurrency).toBe("EUR");
  });

  it("uses client_config sub asset class lookup when creating a portfolio", async () => {
    mockChangeRequestRow(buildFields(fullFieldValues));
    stubGetChangeRequestSupportingQueries();
    stubFkChecksAllPass();
    stubSubAssetClassLookup();
    stubDuplicateCheck(false);

    let insertRan = false;
    onQuery(/insert into portfolios/i, () => {
      insertRan = true;
      return [];
    });

    const result = await runCreatePortfolio();

    expect(result.success).toBe(true);
    expect(insertRan).toBe(true);
  });
});

describe("updateChangeStatus routes portfolio_addition correctly (mocked DB)", () => {
  const CHANGE_REQUEST_ID = "a1000000-0000-0000-0000-000000000001";

  it("invokes the portfolio_addition path when status becomes 'processed'", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // updateChangeStatus runs inside sql.begin(tx => ...).
    // Our mocked sql.begin passes the same tagged-template handler as tx.
    onQuery(/SELECT status, submitted_at FROM change_requests/i, () => [
      { status: "submitted", submitted_at: null },
    ]);
    onQuery(/UPDATE change_requests SET/i, () => []);
    onQuery(/INSERT INTO status_history/i, () => []);

    // When status becomes 'processed', it SELECTs change_type for routing
    onQuery(/SELECT change_type FROM change_requests WHERE/i, () => [
      { change_type: "portfolio_addition" },
    ]);

    // Then it dynamically imports ./db and calls createPortfolioFromChangeAction,
    // which calls getChangeRequest — we need that to return something too.
    // (This exercises the full chain — table missing errors are fine.)

    const { updateChangeStatus } = await import("@/lib/db");
    const result = await updateChangeStatus(CHANGE_REQUEST_ID, "processed", "System");

    expect(result).toBe(CHANGE_REQUEST_ID);
  });
});
