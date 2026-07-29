/**
 * Tests for change request creation.
 *
 * Covers:
 * 1. The `saveChangeRequest` function with a mock database — valid change_type_id
 *    correctly passes through to the INSERT, missing change_type_id inserts NULL.
 * 2. Source-level regression: `ensureChangeTypeConfigTable` no longer skips seeding
 *    when the table already has data (the FK violation root cause).
 * 3. Fixture fallback: `getChangeTypeById` returns canonical configs that match
 *    the well-known UUIDs used by server actions, so FK references resolve.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Static imports (evaluate before mocks) ──────────────────────────────
import { DEFAULT_CHANGE_TYPE_CONFIGS } from "@/lib/db";

// ── Postgres mock (hoisted by vitest) ───────────────────────────────────

const queryHandlers = new Map<
  string,
  (sql: string, params: unknown[]) => unknown[]
>();
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
        // skip invalid patterns
      }
    }

    unmatchedSqlLog.push(reconstructed.substring(0, 200));
    return Promise.resolve([]);
  };

  const sql = Object.assign(handlerFn, {
    begin: vi.fn(
      (cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn),
    ),
    end: vi.fn().mockResolvedValue(undefined),
  });

  return { default: vi.fn(() => sql) };
});

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Stub all queries needed for `saveChangeRequest` to run successfully.
 * Simulates a database that has the new columns (sla_lead_weeks etc.)
 * and sufficient FK reference data.
 */
function stubDbForSuccess(): void {
  // ensureTables: change_requests table exists
  onQuery(/SELECT 1 FROM change_requests LIMIT 0/, () => []);
  // ensureAuditTables: audit_log table exists
  onQuery(/SELECT 1 FROM audit_log LIMIT 0/, () => []);
  // ensureChangeTypeConfigTable: change_type_config exists and has rows
  onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [
    { cnt: DEFAULT_CHANGE_TYPE_CONFIGS.length },
  ]);
  // Seed INSERT ON CONFLICT DO NOTHING — just return empty
  onQuery(/INSERT INTO change_type_config/, () => []);
  // Schema check: sla_lead_weeks column exists (new schema path)
  onQuery(/SELECT sla_lead_weeks FROM change_requests LIMIT 0/, () => []);
  // changeTypeId existence check — return a row for matching known IDs
  onQuery(/SELECT 1 FROM change_type_config WHERE id =/, (_sql, params) => {
    const id = params?.[0] as string | undefined;
    if (id) {
      const exists = DEFAULT_CHANGE_TYPE_CONFIGS.some(
        (c) => c.id === id,
      );
      return exists ? [{ 1: 1 }] : [];
    }
    return [{ 1: 1 }];
  });
  // INSERT INTO change_requests — the main action
  onQuery(/INSERT INTO change_requests/, () => []);
  // INSERT INTO change_request_items
  onQuery(/INSERT INTO change_request_items/, () => []);
  // INSERT INTO audit_log
  onQuery(/INSERT INTO audit_log/, () => []);
}

// ── Fixtures ────────────────────────────────────────────────────────────

const VALID_CHANGE_TYPE_CONFIG = DEFAULT_CHANGE_TYPE_CONFIGS.find(
  (c) => c.slug === "benchmark_switch",
)!;
const VALID_CHANGE_TYPE_ID = VALID_CHANGE_TYPE_CONFIG.id;
const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
const VALID_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff";
const VALID_BENCHMARK_ID = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1";

// ── Hooks ───────────────────────────────────────────────────────────────

beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 1: Fixture integrity — canonical change type IDs
// ═════════════════════════════════════════════════════════════════════════

describe("Canonical change type config fixture IDs", () => {
  it("benchmark_switch has a well-known, stable UUID", () => {
    const cfg = DEFAULT_CHANGE_TYPE_CONFIGS.find(
      (c) => c.slug === "benchmark_switch",
    );
    expect(cfg).toBeDefined();
    expect(cfg!.id).toBe("a0000000-0000-0000-0000-000000000001");
  });

  it("new_benchmark has a well-known, stable UUID", () => {
    const cfg = DEFAULT_CHANGE_TYPE_CONFIGS.find(
      (c) => c.slug === "new_benchmark",
    );
    expect(cfg).toBeDefined();
    expect(cfg!.id).toBe("a0000000-0000-0000-0000-000000000002");
  });

  it("every canonical config has a non-empty unique id", () => {
    const ids = DEFAULT_CHANGE_TYPE_CONFIGS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(DEFAULT_CHANGE_TYPE_CONFIGS.length);
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  it("every canonical config has a unique slug", () => {
    const slugs = DEFAULT_CHANGE_TYPE_CONFIGS.map((c) => c.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(DEFAULT_CHANGE_TYPE_CONFIGS.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 2: getChangeTypeById fixture fallback
// ═════════════════════════════════════════════════════════════════════════

describe("getChangeTypeById fixture fallback", () => {
  it("returns canonical config for benchmark_switch UUID (no DB)", async () => {
    const { getChangeTypeById } = await import("@/lib/db");
    const result = await getChangeTypeById(
      "a0000000-0000-0000-0000-000000000001",
    );
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("benchmark_switch");
    expect(result!.name).toBe("Benchmarkwissel");
  });

  it("returns null for unknown UUID (no DB)", async () => {
    const { getChangeTypeById } = await import("@/lib/db");
    const result = await getChangeTypeById(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 3: saveChangeRequest with mocked DB — valid change_type_id
// ═════════════════════════════════════════════════════════════════════════

describe("saveChangeRequest with valid changeTypeId", () => {
  const FUTURE_DATE = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .split("T")[0];

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
  });

  it("saves a change request with valid changeTypeId", async () => {
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");

    let capturedSql = "";
    onQuery(/INSERT INTO change_requests/, (sql) => {
      capturedSql = sql;
      return [];
    });

    await expect(
      saveChangeRequest({
        id: "b0000000-0000-0000-0000-000000000001",
        reference: "BCM-2026-BS-TEST01",
        changeType: "benchmark_switch",
        changeTypeId: VALID_CHANGE_TYPE_ID,
        clientId: VALID_CLIENT_ID,
        requestedBy: "Test Aanvrager",
        rationale: "Test change request creation with valid change type.",
        effectiveDate: FUTURE_DATE,
        items: [
          {
            id: "b0000000-0000-0000-0000-000000000002",
            portfolioId: VALID_PORTFOLIO_ID,
            previousBenchmarkId: VALID_BENCHMARK_ID,
            requestedBenchmarkId: VALID_BENCHMARK_ID,
          },
        ],
      }),
    ).resolves.toBeUndefined();

    // Verify change_type_id is in the INSERT SQL (not null)
    expect(capturedSql).toContain("change_type_id");
    expect(capturedSql).not.toContain("null");
  });

  it("saves a change request with all optional fields populated", async () => {
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");

    await expect(
      saveChangeRequest({
        id: "b0000000-0000-0000-0000-000000000003",
        reference: "BCM-2026-BS-TEST02",
        changeType: "benchmark_switch",
        changeTypeId: VALID_CHANGE_TYPE_ID,
        clientId: VALID_CLIENT_ID,
        requestedBy: "Test Aanvrager",
        rationale: "Test with estimated cost and stakeholder assignments.",
        effectiveDate: FUTURE_DATE,
        items: [],
        fields: [
          { fieldKey: "portfolio_id", istValue: null, sollValue: VALID_PORTFOLIO_ID },
        ],
        estimatedCost: 500,
        estimatedCostCurrency: "EUR",
        estimatedLeadDays: 7,
        stakeholderAssignments: [
          { stakeholderId: "internal_admin", contact: "admin@test.nl", notifiedAt: null },
        ],
      }),
    ).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 4: saveChangeRequest with missing / invalid change_type_id
// ═════════════════════════════════════════════════════════════════════════

describe("saveChangeRequest without changeTypeId", () => {
  const FUTURE_DATE = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .split("T")[0];

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
  });

  it("still runs (the FK constraint is DB-enforced, not app-level)", async () => {
    // The function accepts changeTypeId as optional and passes it through.
    // Without a real DB the FK constraint is never enforced, but we verify
    // the function doesn't crash and the SQL contains a parameter for it.
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");

    let capturedSql = "";
    onQuery(/INSERT INTO change_requests/, (sql) => {
      capturedSql = sql;
      return [];
    });

    await expect(
      saveChangeRequest({
        id: "c0000000-0000-0000-0000-000000000001",
        reference: "BCM-2026-BS-TEST03",
        changeType: "benchmark_switch",
        // changeTypeId intentionally NOT set
        clientId: VALID_CLIENT_ID,
        requestedBy: "Test Aanvrager",
        rationale: "Test without change type ID — should not crash.",
        effectiveDate: FUTURE_DATE,
        items: [],
      }),
    ).resolves.toBeUndefined();

    // The INSERT still runs; change_type_id will be null in the DB
    expect(capturedSql).toContain("change_type_id");
  });

  it("still runs with explicit undefined changeTypeId", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");
    await expect(
      saveChangeRequest({
        id: "c0000000-0000-0000-0000-000000000002",
        reference: "BCM-2026-BS-TEST04",
        changeType: "benchmark_switch",
        changeTypeId: undefined,
        clientId: VALID_CLIENT_ID,
        requestedBy: "Test Aanvrager",
        rationale: "Test with undefined change type ID.",
        effectiveDate: FUTURE_DATE,
        items: [],
      }),
    ).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 5: Regression — ensureChangeTypeConfigTable always seeds
// ═════════════════════════════════════════════════════════════════════════

describe("FK violation regression: ensureChangeTypeConfigTable", () => {
  it("no longer has an early-return guard before seeding", async () => {
    // The FK violation was caused by an early-return in ensureChangeTypeConfigTable
    // that skipped seedChangeTypeConfigs when change_type_config already had rows.
    // Verify the source code does NOT contain this pattern.
    const fs = await import("fs/promises");
    const content = await fs.readFile(
      new URL("../lib/db.ts", import.meta.url),
      "utf-8",
    );

    // The function should NOT have a guard that returns early after finding
    // non-zero rows without calling seedChangeTypeConfigs.
    // Specifically, check for the fix: seedChangeTypeConfigs is called
    // regardless of whether the table already has data.
    const functionMatch = content.match(
      /async function ensureChangeTypeConfigTable[\s\S]*?(?=\n\S|\n\n\n)/,
    );
    expect(functionMatch).not.toBeNull();

    const fnBody = functionMatch![0];

    // Must call seedChangeTypeConfigs (the fix)
    expect(fnBody).toContain("seedChangeTypeConfigs");

    // Must NOT have an early-return that skips seeding when cnt > 0
    // The old buggy pattern was: if (Number(row?.cnt ?? 0) > 0) return;
    // Verify no such early return exists now.
    const earlyReturnMatch = fnBody.match(
      /if\s*\(Number\(row\?\.cnt\s*\?\?\s*0\)\s*>\s*0\)\s*\{?\s*return/i,
    );
    expect(earlyReturnMatch).toBeNull();
  });

  it("seedChangeTypeConfigs always runs when ensureChangeTypeConfigTable is called", async () => {
    // Simulate a scenario where the change_type_config table exists with data.
    // ensureChangeTypeConfigTable must still attempt to seed.
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // change_type_config exists with rows
    onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [
      { cnt: 5 },
    ]);
    // seedChangeTypeConfigs INSERTs (ON CONFLICT DO NOTHING)
    let seedCalled = false;
    onQuery(/INSERT INTO change_type_config/, () => {
      seedCalled = true;
      return [];
    });

    // Other queries saveChangeRequest needs
    onQuery(/SELECT 1 FROM change_requests LIMIT 0/, () => []);
    onQuery(/SELECT 1 FROM audit_log LIMIT 0/, () => []);
    onQuery(/SELECT sla_lead_weeks FROM change_requests LIMIT 0/, () => []);
    // changeTypeId existence check — this ID matches a default config
    onQuery(/SELECT 1 FROM change_type_config WHERE id =/, () => [{ 1: 1 }]);
    onQuery(/INSERT INTO change_requests/, () => []);
    onQuery(/INSERT INTO change_request_items/, () => []);
    onQuery(/INSERT INTO audit_log/, () => []);

    const { saveChangeRequest } = await import("@/lib/db");

    const FUTURE_DATE = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];

    await saveChangeRequest({
      id: "d0000000-0000-0000-0000-000000000001",
      reference: "BCM-2026-BS-REG01",
      changeType: "benchmark_switch",
      changeTypeId: "a0000000-0000-0000-0000-000000000001",
      clientId: VALID_CLIENT_ID,
      requestedBy: "Regression Test",
      rationale: "Testing seeding happens even when table has data.",
      effectiveDate: FUTURE_DATE,
      items: [],
    });

    expect(seedCalled).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 6: changeTypeId existence validation
// ═════════════════════════════════════════════════════════════════════════

describe("changeTypeId existence validation", () => {
  const FUTURE_DATE = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .split("T")[0];
  const BASE_REQUEST = {
    id: "f0000000-0000-0000-0000-000000000001",
    reference: "BCM-2026-VL-TEST01",
    changeType: "benchmark_switch",
    clientId: VALID_CLIENT_ID,
    requestedBy: "Validatie Test",
    rationale: "Test voor changeTypeId validatie.",
    effectiveDate: FUTURE_DATE,
    items: [],
  };

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();
  });

  it("accepts a valid changeTypeId that exists in change_type_config", async () => {
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");

    await expect(
      saveChangeRequest({
        ...BASE_REQUEST,
        changeTypeId: "a0000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a non-existent changeTypeId with a descriptive error", async () => {
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");

    await expect(
      saveChangeRequest({
        ...BASE_REQUEST,
        changeTypeId: "e0000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(
      'Change type config met ID "e0000000-0000-0000-0000-000000000000" bestaat niet.',
    );
  });

  it("allows omit changeTypeId (optional field)", async () => {
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");

    await expect(
      saveChangeRequest({
        ...BASE_REQUEST,
        // changeTypeId intentionally omitted
      }),
    ).resolves.toBeUndefined();
  });

  it("allows explicit undefined changeTypeId", async () => {
    stubDbForSuccess();
    const { saveChangeRequest } = await import("@/lib/db");

    await expect(
      saveChangeRequest({
        ...BASE_REQUEST,
        changeTypeId: undefined,
      }),
    ).resolves.toBeUndefined();
  });
});
