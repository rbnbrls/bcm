/**
 * Unit tests for the client onboarding apply step
 * (applyClientOnboardingStaging in lib/onboarding-staging-db.ts) and its
 * wiring into processChangeForProcessedStatus (lib/change-processor.ts).
 *
 * The postgres module is mocked with a query-handler registry (same pattern
 * as tests/change-portfolio-config-workflow.test.ts), so these tests exercise
 * the apply's SQL construction, transaction flow (via the mocked `begin`),
 * idempotency handling, and failure marking without a real PostgreSQL
 * instance:
 *
 *  - successful apply: creates parent_account (when missing), client,
 *    portfolio and portfolio_configuration in one transaction, then flips the
 *    staging row to 'applied'.
 *  - duplicate client code: an existing client_config.client row skips the
 *    inserts (idempotent) and still marks the staging row 'applied'.
 *  - transaction rollback: when a live insert fails mid-transaction, the
 *    apply returns success:false and marks the staging row 'failed' with the
 *    error message (the rollback itself is verified against a real database
 *    in tests/onboarding-apply-integration.test.ts).
 *  - already applied / not staged: safe skips without writes.
 *  - processor routing: processChangeForProcessedStatus dispatches
 *    customer_onboarding changes to the onboarding apply.
 *
 * Every assertion on the mocked SQL verifies that user input is bound as a
 * parameter (never string-interpolated), which is the injection-safety
 * contract of the helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock the sql layer (postgres-js) ────────────────────────────────────
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
        // skip
      }
    }
    unmatchedSqlLog.push(reconstructed.substring(0, 200));
    return Promise.resolve([]);
  };
  const sql = Object.assign(handlerFn, {
    begin: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });
  return { default: vi.fn(() => sql) };
});

beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Fixtures ────────────────────────────────────────────────────────────

const CHANGE_REQUEST_ID = "11111111-2222-4333-8444-555555555555";

/** A pending staging row as the mocked DB would return it (snake_case). */
function makeStagingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    staging_id: "42",
    change_request_id: CHANGE_REQUEST_ID,
    client_code: "ADP",
    client_name: "ADP Pensioenfonds",
    portfolio_code: "ADP",
    parent_account_code: "ADP_MAIN",
    asset_class_code: "FI",
    sub_asset_class_code: "HYG",
    manager_code: "ROB",
    benchmark_code: "MSCI-WORLD",
    npc_classification_id: 3,
    long_name: "ADP Pensioenfonds Hybride",
    short_name: "ADP",
    effective_from: new Date("2026-01-01T00:00:00Z"),
    effective_until: null,
    status: "pending",
    apply_error: null,
    created_at: new Date("2026-08-01T12:00:00Z"),
    updated_at: new Date("2026-08-01T12:00:00Z"),
    processed_at: null,
    ...overrides,
  };
}

/** Register the default handlers for the happy path (client does not exist). */
function stubHappyPath(options: { clientExists?: boolean } = {}) {
  onQuery(
    /FROM client_config\.client_onboarding_staging\s+WHERE change_request_id/i,
    () => [makeStagingRow()],
  );
  onQuery(/FROM client_config\.client\s+WHERE client_code/i, () =>
    options.clientExists ? [{ client_code: "ADP" }] : [],
  );
  onQuery(/FROM client_config\.parent_account\s+WHERE parent_account_code/i, () => []);
  onQuery(/INSERT INTO client_config\.parent_account/i, () => [
    { parent_account_id: "7" },
  ]);
  onQuery(/INSERT INTO client_config\.client \(client_code, client_name\)/i, () => []);
  onQuery(/INSERT INTO client_config\.portfolio \(portfolio_code, parent_account_id, active_ind\)/i, () => []);
  onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => []);
  onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'applied'/i, () => []);
  onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'failed'/i, () => []);
}

describe("applyClientOnboardingStaging — successful apply", () => {
  it("applies the staged onboarding in one transaction (GUC + client + parent_account + portfolio + portfolio_configuration + staging applied)", async () => {
    const executed: string[] = [];
    let primaryAccountIdParam: unknown = null;
    let stagingAppliedParams: unknown[] = [];

    stubHappyPath();
    // Track every query that runs (the handlers above return data; these
    // appending handlers run first because they are registered first).
    onQuery(/SET LOCAL app\.change_process_bypass/i, () => {
      executed.push("guc");
      return [];
    });
    onQuery(/INSERT INTO client_config\.parent_account/i, (sql, params) => {
      executed.push("parent_account");
      expect(params[0]).toBe("ADP_MAIN");
      return [{ parent_account_id: "7" }];
    });
    onQuery(/INSERT INTO client_config\.client \(client_code, client_name\)/i, (sql, params) => {
      executed.push("client");
      expect(params[0]).toBe("ADP");
      expect(params[1]).toBe("ADP Pensioenfonds");
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio \(portfolio_code, parent_account_id, active_ind\)/i, (sql, params) => {
      executed.push("portfolio");
      expect(params[0]).toBe("ADP");
      expect(params[1]).toBe(7);
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, (sql, params) => {
      executed.push("portfolio_configuration");
      // primary_account_id is derived: ADP*FIHYG*ROB (client*AC{subAC}*manager)
      primaryAccountIdParam = params[0];
      expect(params[1]).toBe("ADP"); // client_code
      expect(params[2]).toBe("ADP"); // portfolio_code
      expect(params[3]).toBe("FI"); // asset_class_code
      expect(params[4]).toBe("HYG"); // sub_asset_class_code
      expect(params[5]).toBe("ROB"); // manager_code
      expect(params[6]).toBe("MSCI-WORLD"); // benchmark_code
      expect(params[7]).toBe(3); // npc_classification_id
      expect(params[12]).toBe(CHANGE_REQUEST_ID); // change_request_id lineage
      return [];
    });
    onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'applied'/i, (sql, params) => {
      executed.push("staging_applied");
      stagingAppliedParams = params;
      return [];
    });

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toMatchObject({
      actionType: "CREATE",
      primaryAccountId: "ADP*FIHYG*ROB",
      result: "applied",
    });
    // All steps ran in order.
    expect(executed).toEqual([
      "guc",
      "parent_account",
      "client",
      "portfolio",
      "portfolio_configuration",
      "staging_applied",
    ]);
    expect(primaryAccountIdParam).toBe("ADP*FIHYG*ROB");
    // The staging update targets the staging_id (bound, never interpolated).
    expect(stagingAppliedParams).toContain(42);
  });

  it("reuses an existing active parent account instead of creating a new one", async () => {
    let parentAccountInserted = false;
    stubHappyPath();
    onQuery(/FROM client_config\.parent_account\s+WHERE parent_account_code/i, () => [
      { parent_account_id: "9" },
    ]);
    onQuery(/INSERT INTO client_config\.parent_account/i, () => {
      parentAccountInserted = true;
      return [{ parent_account_id: "9" }];
    });
    let portfolioParentParam: unknown = null;
    onQuery(/INSERT INTO client_config\.portfolio \(portfolio_code, parent_account_id, active_ind\)/i, (sql, params) => {
      portfolioParentParam = params[1];
      return [];
    });

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(true);
    expect(parentAccountInserted).toBe(false);
    expect(portfolioParentParam).toBe(9);
  });
});

describe("applyClientOnboardingStaging — duplicate client code (idempotent skip)", () => {
  it("skips all live inserts when the client already exists and marks the staging row applied", async () => {
    const executed: string[] = [];
    // Explicit handlers (no stubHappyPath): the staging row exists, the
    // client already exists, and a catch-all records ANY live mutation.
    onQuery(/FROM client_config\.client_onboarding_staging\s+WHERE change_request_id/i, () => [
      makeStagingRow(),
    ]);
    onQuery(/FROM client_config\.client\s+WHERE client_code/i, () => [
      { client_code: "ADP" },
    ]);
    onQuery(/SET LOCAL app\.change_process_bypass/i, () => []);
    onQuery(/INSERT INTO client_config\./i, (sql, params) => {
      executed.push(`insert:${sql.split("INTO")[1]?.split(" ")[1] ?? "?"}`);
      return [];
    });
    onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'applied'/i, (sql, params) => {
      executed.push("staging_applied");
      // status is a template literal; the only bound value is the staging_id.
      expect(params).toEqual([42]);
      return [];
    });

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toMatchObject({
      actionType: "SKIP",
      primaryAccountId: "ADP",
      result: "skipped",
    });
    // No live-table mutations happened — only the staging row was flipped.
    expect(executed).toEqual(["staging_applied"]);
    expect(unmatchedSqlLog.length).toBe(0);
  });

  it("returns a safe skip without any writes when the staging row is already applied", async () => {
    // Explicit handlers: the getter returns an 'applied' row; a catch-all
    // records ANY mutation that would follow.
    let anyMutation = false;
    onQuery(/INSERT INTO client_config\.|UPDATE client_config\.client_onboarding_staging/i, () => {
      anyMutation = true;
      return [];
    });
    onQuery(/FROM client_config\.client_onboarding_staging\s+WHERE change_request_id/i, () => [
      makeStagingRow({ status: "applied", processed_at: new Date("2026-08-02T00:00:00Z") }),
    ]);

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(true);
    expect(result.applied[0]).toMatchObject({ actionType: "SKIP", result: "skipped" });
    expect(anyMutation).toBe(false);
  });

  it("returns success with no outcomes when nothing is staged for the change request", async () => {
    stubHappyPath();
    onQuery(/FROM client_config\.client_onboarding_staging\s+WHERE change_request_id/i, () => []);

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
  });
});

describe("applyClientOnboardingStaging — transaction rollback", () => {
  it("marks the staging row failed with the error when a live insert fails, and reports success:false", async () => {
    stubHappyPath();
    const executed: string[] = [];
    onQuery(/INSERT INTO client_config\.client \(client_code, client_name\)/i, () => {
      executed.push("client");
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio \(portfolio_code, parent_account_id, active_ind\)/i, () => {
      executed.push("portfolio");
      return [];
    });
    // The portfolio_configuration insert fails (e.g. FK violation on the
    // npc_classification_id that the live table enforces but staging does not).
    // Note: the mock swallows synchronous throws, so reject the query promise.
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      executed.push("pc_insert");
      return Promise.reject(
        new Error('insert or update on table "portfolio_configuration" violates foreign key constraint'),
      ) as unknown as unknown[];
    });
    let failedUpdateParams: unknown[] = [];
    let appliedUpdateRan = false;
    onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'applied'/i, () => {
      appliedUpdateRan = true;
      return [];
    });
    onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'failed'/i, (sql, params) => {
      executed.push("staging_failed");
      failedUpdateParams = params;
      return [];
    });

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain("violates foreign key constraint");
    // The failed update carries the error message as apply_error ($1) and
    // targets the staging row id ($2) — both bound as parameters.
    expect(failedUpdateParams[0]).toContain("violates foreign key constraint");
    expect(failedUpdateParams[1]).toBe(42);
    // The staging row was marked failed, never applied.
    expect(executed).toEqual(["client", "portfolio", "pc_insert", "staging_failed"]);
    expect(appliedUpdateRan).toBe(false);
  });

  it("marks the staging row failed when the portfolio metadata insert fails (metadata-creation branch)", async () => {
    stubHappyPath();
    const executed: string[] = [];
    onQuery(/INSERT INTO client_config\.client \(client_code, client_name\)/i, () => {
      executed.push("client");
      return [];
    });
    // The portfolio (metadata) insert fails — the "metadata creation" branch
    // of the rollback contract. The apply must abort before the
    // portfolio_configuration insert is even attempted.
    onQuery(/INSERT INTO client_config\.portfolio \(portfolio_code, parent_account_id, active_ind\)/i, () => {
      executed.push("portfolio_metadata");
      return Promise.reject(
        new Error('insert or update on table "portfolio" violates not-null constraint'),
      ) as unknown as unknown[];
    });
    let pcInsertAttempted = false;
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      pcInsertAttempted = true;
      return [];
    });
    let failedUpdateParams: unknown[] = [];
    onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'failed'/i, (sql, params) => {
      executed.push("staging_failed");
      failedUpdateParams = params;
      return [];
    });

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain("violates not-null constraint");
    // apply_error carries the failure message; the update targets staging_id 42.
    expect(failedUpdateParams[0]).toContain("violates not-null constraint");
    expect(failedUpdateParams[1]).toBe(42);
    // The transaction aborted at the metadata insert: no portfolio_configuration
    // insert was attempted, and the staging row was marked failed, never applied.
    expect(executed).toEqual(["client", "portfolio_metadata", "staging_failed"]);
    expect(pcInsertAttempted).toBe(false);
  });

  it("retries the apply for a previously failed staging row", async () => {
    stubHappyPath();
    onQuery(/FROM client_config\.client_onboarding_staging\s+WHERE change_request_id/i, () => [
      makeStagingRow({
        status: "failed",
        apply_error: "insert or update on table \"portfolio_configuration\" violates foreign key constraint",
        processed_at: new Date("2026-08-01T13:00:00Z"),
      }),
    ]);
    let appliedUpdateRan = false;
    onQuery(/UPDATE client_config\.client_onboarding_staging\s+SET status = 'applied'/i, () => {
      appliedUpdateRan = true;
      return [];
    });

    const { applyClientOnboardingStaging } = await import("@/lib/onboarding-staging-db");
    const result = await applyClientOnboardingStaging(CHANGE_REQUEST_ID);

    expect(result.success).toBe(true);
    expect(result.applied[0].result).toBe("applied");
    expect(appliedUpdateRan).toBe(true);
  });
});

describe("processChangeForProcessedStatus — customer_onboarding routing", () => {
  it("dispatches a staged customer_onboarding change to the onboarding apply step", async () => {
    stubHappyPath();

    const { processChangeForProcessedStatus } = await import("@/lib/change-processor");
    const result = await processChangeForProcessedStatus(CHANGE_REQUEST_ID, "customer_onboarding");

    expect(result.applied).toBe(true);
    expect(result.stagedRows).toBe(1);
    expect(result.usedLegacy).toBe(false);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      actionType: "CREATE",
      primaryAccountId: "ADP*FIHYG*ROB",
      result: "applied",
    });
  });

  it("propagates a failed onboarding apply as applied:false with the error", async () => {
    stubHappyPath();
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () =>
      Promise.reject(
        new Error("Kan primaryAccountId niet afleiden uit de dimensies."),
      ) as unknown as unknown[],
    );

    const { processChangeForProcessedStatus } = await import("@/lib/change-processor");
    const result = await processChangeForProcessedStatus(CHANGE_REQUEST_ID, "customer_onboarding");

    expect(result.applied).toBe(false);
    expect(result.stagedRows).toBe(1);
    expect(result.error).toContain("Kan primaryAccountId niet afleiden");
  });
});
