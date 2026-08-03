/**
 * Tests for the change_portfolio_metadata_request workflow.
 *
 * Covers:
 *  - stagePortfolioMetadataChange with validation rules
 *  - getChangePortfolioMetadataRequests (fallback when no DB)
 *  - applyChangePortfolioMetadataRequests (CREATE/RETIRE for both dimensions)
 *  - Admin-only bypass functions
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

describe("stagePortfolioMetadataChange — validation rules", () => {
  it("rejects portfolio code with invalid format", async () => {
    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "CREATE",
      code: "A", // too short (min 2)
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/2-15 tekens/);
    }
    expect(insertCalled).toBe(false);
  });

  it("rejects parent_account code with invalid format", async () => {
    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    // Use special characters that fail even after uppercasing
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "parent_account",
      actionType: "CREATE",
      code: "LOWER@CASE!", // @ and ! don't match pattern even after uppercase
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/verwachte formaat/);
    }
    expect(insertCalled).toBe(false);
  });

  it("rejects portfolio CREATE when parent account code has invalid format", async () => {
    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    // Use a code with special characters that will fail format check even after uppercasing
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "CREATE",
      code: "TESTPORT",
      parentAccountCode: "invalid@code!", // special chars fail format even after uppercase
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/Ouderaccount code/);
    }
    expect(insertCalled).toBe(false);
  });

  it("rejects portfolio CREATE when code already exists", async () => {
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_code: "TESTPORT" }]);

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "CREATE",
      code: "testport",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/bestaat al/);
    }
  });

  it("rejects parent_account CREATE when code already exists", async () => {
    onQuery(/FROM client_config\.parent_account/i, () => [{ parent_account_code: "HOOFD_01" }]);

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "parent_account",
      actionType: "CREATE",
      code: "hoofd_01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/bestaat al/);
    }
  });

  it("rejects portfolio CREATE when referenced parent account does not exist", async () => {
    // Portfolio code is unique (empty result)
    onQuery(/FROM client_config\.portfolio/i, () => []);
    // Parent account not found
    onQuery(/FROM client_config\.parent_account.*active_ind/i, () => []);

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "CREATE",
      code: "NEWPORT",
      parentAccountCode: "PARENT_A",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/bestaat niet of is niet actief/);
    }
  });

  it("rejects portfolio RETIRE when active configs exist", async () => {
    onQuery(/FROM client_config\.portfolio_configuration.*active_ind/i, () => [{ id: 1 }]);
    // Also mock the account check to return empty (so the config check fails first)
    onQuery(/FROM client_config\.account a.*portfolio_code/i, () => []);

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "RETIRE",
      code: "EXISTINGPORT",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/actieve portfolio configuraties/);
    }
  });

  it("rejects parent_account RETIRE when active portfolios exist", async () => {
    onQuery(/FROM client_config\.portfolio.*WHERE.*parent_account_id/i, () => [{ id: 1 }]);

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "parent_account",
      actionType: "RETIRE",
      code: "HOOFD_01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/actieve portfolios/);
    }
  });

  it("rejects duplicate staging in another open change request", async () => {
    // All pre-checks pass (no existing code, no active references)
    onQuery(/FROM client_config\.portfolio/i, () => []);
    onQuery(/FROM client_config\.change_portfolio_metadata_request.*cpmr/i, () => [{ id: 99 }]);

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "CREATE",
      code: "UNIQUEPORT",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatch(/al eerder aangevraagd/);
    }
  });

  it("stages a valid portfolio CREATE", async () => {
    let insertCalled = false;
    onQuery(/FROM client_config\.portfolio/i, () => []);
    onQuery(/FROM client_config\.change_portfolio_metadata_request.*cpmr/i, () => []);
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => {
      insertCalled = true;
      return [{ id: 42 }];
    });

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "CREATE",
      code: "NEWPORT",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("42");
    }
    expect(insertCalled).toBe(true);
  });

  it("stages a valid parent_account CREATE with msa code", async () => {
    let insertCalled = false;
    onQuery(/FROM client_config\.parent_account/i, () => []);
    onQuery(/FROM client_config\.change_portfolio_metadata_request.*cpmr/i, () => []);
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => {
      insertCalled = true;
      return [{ id: 43 }];
    });

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "parent_account",
      actionType: "CREATE",
      code: "HOOFD_NEW",
      msaParentAccountCode: "MSA_001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("43");
    }
    expect(insertCalled).toBe(true);
  });

  it("stages a valid portfolio RETIRE", async () => {
    let insertCalled = false;
    onQuery(/FROM client_config\.portfolio_configuration.*active_ind/i, () => []);
    onQuery(/FROM client_config\.account a.*portfolio_code/i, () => []);
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => {
      insertCalled = true;
      return [{ id: 44 }];
    });

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "portfolio",
      actionType: "RETIRE",
      code: "OLDPORT",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("44");
    }
    expect(insertCalled).toBe(true);
  });

  it("stages a valid parent_account RETIRE", async () => {
    let insertCalled = false;
    onQuery(/FROM client_config\.portfolio.*active_ind.*true.*parent_account_id/i, () => []);
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => {
      insertCalled = true;
      return [{ id: 45 }];
    });

    const { stagePortfolioMetadataChange } = await import("@/lib/client-config-db");
    const result = await stagePortfolioMetadataChange({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "parent_account",
      actionType: "RETIRE",
      code: "HOOFD_OLD",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("45");
    }
    expect(insertCalled).toBe(true);
  });
});

describe("getChangePortfolioMetadataRequests", () => {
  it("returns staged rows for a change request", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_metadata_request/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "portfolio",
          action_type: "CREATE",
          code: "TESTPORT",
          parent_account_code: "PARENT_A",
          msa_parent_account_code: null,
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T12:00:00Z"),
        },
        {
          id: 2,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "parent_account",
          action_type: "RETIRE",
          code: "HOOFD_01",
          parent_account_code: null,
          msa_parent_account_code: null,
          apply_status: "applied",
          apply_error: null,
          created_at: new Date("2026-08-01T12:05:00Z"),
        },
      ],
    );

    const { getChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const rows = await getChangePortfolioMetadataRequests(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].dimension).toBe("portfolio");
    expect(rows[0].actionType).toBe("CREATE");
    expect(rows[0].code).toBe("TESTPORT");
    expect(rows[0].parentAccountCode).toBe("PARENT_A");
    expect(rows[1].dimension).toBe("parent_account");
    expect(rows[1].actionType).toBe("RETIRE");
    expect(rows[1].code).toBe("HOOFD_01");
  });

  it("returns empty array when no rows exist", async () => {
    // No handler registered → mock returns empty array
    const { getChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const rows = await getChangePortfolioMetadataRequests(
      "22222222-2222-2222-2222-222222222222",
    );
    expect(rows).toHaveLength(0);
  });
});

describe("applyChangePortfolioMetadataRequests", () => {
  it("returns empty when no staged rows", async () => {
    const { applyChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioMetadataRequests(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(0);
  });

  it("applies a portfolio CREATE with parent_account resolution", async () => {
    // getChangePortfolioMetadataRequests returns one row
    onQuery(
      /FROM client_config\.change_portfolio_metadata_request/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "portfolio",
          action_type: "CREATE",
          code: "NEWPORT",
          parent_account_code: "PARENT_A",
          msa_parent_account_code: null,
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T12:00:00Z"),
        },
      ],
    );
    // Resolve parent_account_code → parent_account_id
    onQuery(
      /SELECT parent_account_id FROM client_config\.parent_account.*PARENT_A/i,
      () => [{ parent_account_id: 5 }],
    );
    // Track the INSERT into portfolio
    let portfolioInserted = false;
    onQuery(/INSERT INTO client_config\.portfolio/i, () => {
      portfolioInserted = true;
      return [];
    });
    // Track the apply_status update
    onQuery(/UPDATE client_config\.change_portfolio_metadata_request.*SET apply_status/i, () => []);

    const { applyChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioMetadataRequests(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].actionType).toBe("CREATE");
    expect(result.applied[0].primaryAccountId).toBe("NEWPORT");
    expect(result.applied[0].result).toBe("applied");
    expect(portfolioInserted).toBe(true);
  });

  it("applies a parent_account CREATE", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_metadata_request/i,
      () => [
        {
          id: 2,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "parent_account",
          action_type: "CREATE",
          code: "HOOFD_NEW",
          parent_account_code: null,
          msa_parent_account_code: "MSA_001",
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T12:00:00Z"),
        },
      ],
    );
    let paInserted = false;
    onQuery(/INSERT INTO client_config\.parent_account/i, () => {
      paInserted = true;
      return [];
    });
    onQuery(/UPDATE client_config\.change_portfolio_metadata_request.*SET apply_status/i, () => []);

    const { applyChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioMetadataRequests(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].result).toBe("applied");
    expect(paInserted).toBe(true);
  });

  it("applies a portfolio RETIRE", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_metadata_request/i,
      () => [
        {
          id: 3,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "portfolio",
          action_type: "RETIRE",
          code: "OLDPORT",
          parent_account_code: null,
          msa_parent_account_code: null,
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T12:00:00Z"),
        },
      ],
    );
    let portfolioRetired = false;
    onQuery(/UPDATE client_config\.portfolio.*active_ind/i, () => {
      portfolioRetired = true;
      return [];
    });
    onQuery(/UPDATE client_config\.change_portfolio_metadata_request.*SET apply_status/i, () => []);

    const { applyChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioMetadataRequests(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].result).toBe("applied");
    expect(portfolioRetired).toBe(true);
  });

  it("applies a parent_account RETIRE", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_metadata_request/i,
      () => [
        {
          id: 4,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "parent_account",
          action_type: "RETIRE",
          code: "HOOFD_OLD",
          parent_account_code: null,
          msa_parent_account_code: null,
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T12:00:00Z"),
        },
      ],
    );
    let paRetired = false;
    onQuery(/UPDATE client_config\.parent_account.*active_ind/i, () => {
      paRetired = true;
      return [];
    });
    onQuery(/UPDATE client_config\.change_portfolio_metadata_request.*SET apply_status/i, () => []);

    const { applyChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioMetadataRequests(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].result).toBe("applied");
    expect(paRetired).toBe(true);
  });

  it("handles error during apply and marks row as failed", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_metadata_request/i,
      () => [
        {
          id: 5,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "portfolio",
          action_type: "CREATE",
          code: "FAILPORT",
          parent_account_code: null,
          msa_parent_account_code: null,
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T12:00:00Z"),
        },
      ],
    );
    // Make the INSERT throw — this simulates a DB constraint violation
    let failedUpdateCalled = false;
    onQuery(/INSERT INTO client_config\.portfolio/i, () => {
      return Promise.reject(new Error("Constraint violation: duplicate key"));
    });
    onQuery(/UPDATE.*change_portfolio_metadata_request.*SET apply_status.*failed.*apply_error/i, () => {
      failedUpdateCalled = true;
      return [];
    });

    const { applyChangePortfolioMetadataRequests } = await import("@/lib/client-config-db");
    const result = await applyChangePortfolioMetadataRequests(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.success).toBe(false);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].result).toBe("failed");
    expect(failedUpdateCalled).toBe(true);
  });
});

describe("Admin-only bypass functions", () => {
  it("createClientConfigPortfolio creates a new portfolio", async () => {
    onQuery(/FROM client_config\.portfolio.*portfolio_code/i, () => []);
    onQuery(/INSERT INTO client_config\.portfolio.*RETURNING/i, () => [
      { portfolio_id: 10, portfolio_code: "ADMINPORT", parent_account_id: null, active_ind: true },
    ]);

    const { createClientConfigPortfolio } = await import("@/lib/client-config-db");
    const result = await createClientConfigPortfolio({ portfolioCode: "adminport" });
    expect(result.portfolioId).toBe(10);
    expect(result.portfolioCode).toBe("ADMINPORT");
    expect(result.activeInd).toBe(true);
  });

  it("createClientConfigPortfolio rejects duplicate codes", async () => {
    onQuery(/FROM client_config\.portfolio.*portfolio_code/i, () => [{ portfolio_code: "DUPEPORT" }]);

    const { createClientConfigPortfolio } = await import("@/lib/client-config-db");
    await expect(
      createClientConfigPortfolio({ portfolioCode: "dupeport" }),
    ).rejects.toThrow(/bestaat al/);
  });

  it("retireClientConfigPortfolio throws when active configs exist", async () => {
    onQuery(/FROM client_config\.portfolio_configuration.*active_ind/i, () => [{ id: 1 }]);

    const { retireClientConfigPortfolio } = await import("@/lib/client-config-db");
    await expect(
      retireClientConfigPortfolio("BUSYPORT"),
    ).rejects.toThrow(/actieve portfolio configuraties/);
  });

  it("retireClientConfigPortfolio succeeds when no active references", async () => {
    onQuery(/FROM client_config\.portfolio_configuration.*active_ind/i, () => []);
    onQuery(/FROM client_config\.account a.*portfolio_code/i, () => []);
    let retired = false;
    onQuery(/UPDATE client_config\.portfolio SET active_ind/i, () => {
      retired = true;
      return [];
    });

    const { retireClientConfigPortfolio } = await import("@/lib/client-config-db");
    await retireClientConfigPortfolio("CLEANPORT");
    expect(retired).toBe(true);
  });

  it("createClientConfigParentAccount creates a new parent account", async () => {
    onQuery(/FROM client_config\.parent_account.*parent_account_code/i, () => []);
    onQuery(/INSERT INTO client_config\.parent_account.*RETURNING/i, () => [
      { parent_account_id: 20, parent_account_code: "ADMIN_HOOFD", msa_parent_account_code: null, active_ind: true },
    ]);

    const { createClientConfigParentAccount } = await import("@/lib/client-config-db");
    const result = await createClientConfigParentAccount({ parentAccountCode: "admin_hoofd" });
    expect(result.parentAccountId).toBe(20);
    expect(result.parentAccountCode).toBe("ADMIN_HOOFD");
    expect(result.activeInd).toBe(true);
  });

  it("retireClientConfigParentAccount throws when active portfolios exist", async () => {
    onQuery(/FROM client_config\.portfolio.*WHERE.*parent_account_id/i, () => [{ id: 1 }]);

    const { retireClientConfigParentAccount } = await import("@/lib/client-config-db");
    await expect(
      retireClientConfigParentAccount("BUSY_HOOFD"),
    ).rejects.toThrow(/actieve portfolios/);
  });

  it("hardDeleteClientConfigPortfolio deletes when unreferenced", async () => {
    onQuery(/FROM client_config\.portfolio_configuration.*portfolio_code/i, () => []);
    onQuery(/FROM client_config\.account a.*portfolio_code/i, () => []);
    onQuery(/DELETE FROM client_config\.portfolio.*portfolio_code/i, () => [{ portfolio_id: 10 }]);

    const { hardDeleteClientConfigPortfolio } = await import("@/lib/client-config-db");
    const result = await hardDeleteClientConfigPortfolio("GONEPORT");
    expect(result).toBe(true);
  });

  it("hardDeleteClientConfigParentAccount deletes when unreferenced", async () => {
    onQuery(/FROM client_config\.portfolio.*parent_account_id/i, () => []);
    onQuery(/DELETE FROM client_config\.parent_account.*parent_account_code/i, () => [{ parent_account_id: 20 }]);

    const { hardDeleteClientConfigParentAccount } = await import("@/lib/client-config-db");
    const result = await hardDeleteClientConfigParentAccount("GONE_HOOFD");
    expect(result).toBe(true);
  });
});

describe("Admin-only bypass functions — audit trail", () => {
  it("createClientConfigPortfolio records an admin_audit_log entry", async () => {
    onQuery(/FROM client_config\.portfolio.*portfolio_code/i, () => []);
    onQuery(/INSERT INTO client_config\.portfolio.*RETURNING/i, () => [
      { portfolio_id: 10, portfolio_code: "AUDITPORT", parent_account_id: null, active_ind: true },
    ]);
    let auditInserted = false;
    let auditValues: unknown[] = [];
    onQuery(/INSERT INTO client_config\.admin_audit_log/i, (_sql, params) => {
      auditInserted = true;
      auditValues = params;
      return [];
    });

    const { createClientConfigPortfolio } = await import("@/lib/client-config-db");
    await createClientConfigPortfolio({ portfolioCode: "auditport", actor: "tester" });
    expect(auditInserted).toBe(true);
    expect(auditValues[0]).toBe("create_portfolio");
    expect(auditValues[1]).toBe("portfolio");
    expect(auditValues[2]).toBe("AUDITPORT");
    expect(auditValues[3]).toBe("tester");
  });

  it("retireClientConfigPortfolio records an admin_audit_log entry", async () => {
    onQuery(/FROM client_config\.portfolio_configuration.*active_ind/i, () => []);
    onQuery(/FROM client_config\.account a.*portfolio_code/i, () => []);
    onQuery(/UPDATE client_config\.portfolio SET active_ind/i, () => []);
    let auditInserted = false;
    onQuery(/INSERT INTO client_config\.admin_audit_log/i, () => {
      auditInserted = true;
      return [];
    });

    const { retireClientConfigPortfolio } = await import("@/lib/client-config-db");
    await retireClientConfigPortfolio("CLEANPORT", "tester");
    expect(auditInserted).toBe(true);
  });

  it("hardDeleteClientConfigPortfolio records an admin_audit_log entry with deleted=true", async () => {
    onQuery(/FROM client_config\.portfolio_configuration.*portfolio_code/i, () => []);
    onQuery(/FROM client_config\.account a.*portfolio_code/i, () => []);
    onQuery(/DELETE FROM client_config\.portfolio.*portfolio_code/i, () => [{ portfolio_id: 10 }]);
    let auditValues: unknown[] = [];
    onQuery(/INSERT INTO client_config\.admin_audit_log/i, (_sql, params) => {
      auditValues = params;
      return [];
    });

    const { hardDeleteClientConfigPortfolio } = await import("@/lib/client-config-db");
    const result = await hardDeleteClientConfigPortfolio("GONEPORT", "tester");
    expect(result).toBe(true);
    expect(auditValues[0]).toBe("hard_delete_portfolio");
    expect(auditValues[2]).toBe("GONEPORT");
  });

  it("updateClientConfigParentAccount records before/after in the audit details", async () => {
    onQuery(/SELECT parent_account_code, msa_parent_account_code/i, () => [
      { parent_account_code: "OLD_HOOFD", msa_parent_account_code: "MSA_OLD" },
    ]);
    onQuery(/UPDATE client_config\.parent_account/i, () => [
      { parent_account_id: 20, parent_account_code: "NEW_HOOFD", msa_parent_account_code: "MSA_NEW", active_ind: true },
    ]);
    let auditValues: unknown[] = [];
    onQuery(/INSERT INTO client_config\.admin_audit_log/i, (_sql, params) => {
      auditValues = params;
      return [];
    });

    const { updateClientConfigParentAccount } = await import("@/lib/client-config-db");
    const result = await updateClientConfigParentAccount(
      20,
      { parentAccountCode: "new_hoofd", msaParentAccountCode: "msa_new" },
      "tester",
    );
    expect(result.parentAccountCode).toBe("NEW_HOOFD");
    expect(auditValues[0]).toBe("update_parent_account");
    expect(auditValues[1]).toBe("parent_account");
    expect(auditValues[2]).toBe("NEW_HOOFD");
    expect(auditValues[3]).toBe("tester");
    const details = JSON.parse(String(auditValues[4]));
    expect(details.before.parent_account_code).toBe("OLD_HOOFD");
    expect(details.after.parent_account_code).toBe("NEW_HOOFD");
    expect(details.after.msa_parent_account_code).toBe("MSA_NEW");
  });

  it("retireClientConfigParentAccount records an admin_audit_log entry", async () => {
    onQuery(/FROM client_config\.portfolio.*WHERE.*parent_account_id/i, () => []);
    onQuery(/UPDATE client_config\.parent_account SET active_ind/i, () => []);
    let auditInserted = false;
    onQuery(/INSERT INTO client_config\.admin_audit_log/i, () => {
      auditInserted = true;
      return [];
    });

    const { retireClientConfigParentAccount } = await import("@/lib/client-config-db");
    await retireClientConfigParentAccount("CLEAN_HOOFD", "tester");
    expect(auditInserted).toBe(true);
  });

  it("a rejected admin mutation writes NO audit entry", async () => {
    onQuery(/FROM client_config\.portfolio_configuration.*active_ind/i, () => [{ id: 1 }]);
    let auditInserted = false;
    onQuery(/INSERT INTO client_config\.admin_audit_log/i, () => {
      auditInserted = true;
      return [];
    });

    const { retireClientConfigPortfolio } = await import("@/lib/client-config-db");
    await expect(
      retireClientConfigPortfolio("BUSYPORT", "tester"),
    ).rejects.toThrow(/actieve portfolio configuraties/);
    expect(auditInserted).toBe(false);
  });
});