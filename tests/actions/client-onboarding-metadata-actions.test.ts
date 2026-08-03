/**
 * Unit tests for the client onboarding server action's portfolio + parent-account
 * metadata integration (createClientOnboardingChange — task t_4fbdd465).
 *
 * Covers the governed metadata staging path: the action creates the
 * client_onboarding change request AND stages portfolio / parent-account
 * metadata rows via stagePortfolioMetadataChange, surfacing Dutch validation
 * issues (duplicate codes) in the returned form state.
 *
 * Uses a mocked DB layer (same pattern as portfolio-addition-actions.test.ts)
 * so the tests run without a real database.
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

// ── Global hooks ────────────────────────────────────────────────────────────
beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
describe("createClientOnboardingChange — portfolio metadata staging", () => {
  /**
   * Stub the DB queries needed for a successful onboarding flow:
   * reference data → change type config → public client resolution →
   * change request insert → metadata staging inserts.
   *
   * Pattern notes: reference-data queries filter `active_ind = true`; the
   * uniqueness lookup queries start with `SELECT 1 FROM`. The mock returns the
   * FIRST registered matching pattern, so these must not overlap ambiguously.
   */
  function stubDbForSuccess() {
    // getClientConfigReferenceData queries
    onQuery(/FROM client_config\.client/i, () => [
      { client_code: "WX8", client_name: "WX8 Pensioenfonds" },
    ]);
    onQuery(/FROM client_config\.portfolio WHERE active_ind = true/i, () => []); // no existing portfolios
    onQuery(/FROM client_config\.asset_class/i, () => [
      { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
    ]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [
      { sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" },
    ]);
    onQuery(/FROM client_config\.manager/i, () => [
      { manager_id: 1, manager_code: "EIG", manager_name: "EIGEN BEHEER" },
    ]);
    onQuery(/FROM client_config\.benchmark/i, () => [
      { benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null },
    ]);
    onQuery(/FROM client_config\.npc_classification/i, () => [
      { npc_classification_id: 1, classification_name: "Pensioen" },
    ]);
    // No existing active parent accounts (a brand-new parent account is created)
    onQuery(/FROM client_config\.parent_account WHERE active_ind = true/i, () => []);

    // ── Uniqueness lookups (SELECT 1 …) — nothing exists by default ──
    onQuery(/SELECT 1 FROM client_config\.portfolio/i, () => []);
    onQuery(/SELECT 1 FROM client_config\.parent_account/i, () => []);

    // getChangeTypeBySlug: change_type_config lookup (empty → default fallback)
    onQuery(/FROM change_type_config WHERE slug/i, () => []);
    // saveChangeRequest internals
    onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
    onQuery(/SELECT sla_lead_weeks FROM change_requests LIMIT 0/i, () => []);
    onQuery(/INSERT INTO change_requests/i, () => []);
    onQuery(/INSERT INTO status_history/i, () => []);
    onQuery(/INSERT INTO audit_log/i, () => []);

    // getPublicClientIdByCode → no existing public client (returns null)
    onQuery(/FROM clients WHERE external_reference ILIKE/i, () => []);
    // resolveOnboardingClientId → INSERT placeholder public clients row
    onQuery(/INSERT INTO clients \(id, name, external_reference\)/i, () => [{ id: "11111111-1111-1111-1111-111111111111" }]);

    // duplicate-staging check (join change_requests)
    onQuery(/FROM client_config\.change_portfolio_metadata_request cpmr/i, () => []);
    // ── stagePortfolioMetadataChange inserts ──
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, () => [{ id: 1 }]);
  }

  function validFormData(overrides: Record<string, string> = {}): FormData {
    return buildMockFormData({
      clientCode: "WX8",
      clientName: "WX8 Pensioenfonds",
      portfolioName: "Rendementsportefeuille",
      portfolioCode: "WX8RP",
      assetClassCode: "EQ",
      allocationPercentage: "100",
      parentAccountCode: "WX8_HOOFD",
      msaParentAccountCode: "WX8_MSA_01",
      ...overrides,
    });
  }

  it("stages parent-account CREATE + portfolio CREATE rows via the staging helper", async () => {
    stubDbForSuccess();

    // Track metadata staging inserts
    const stagedRows: Array<Record<string, unknown>> = [];
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, (_sql, params) => {
      stagedRows.push(Object.fromEntries(
        (["change_request_id", "dimension", "action_type", "code", "parent_account_code", "msa_parent_account_code"] as const)
          .map((key, i) => [key, params[i]]),
      ));
      return [{ id: stagedRows.length }];
    });

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    // redirect() throws (mocked) after staging — the action succeeded
    await expect(createClientOnboardingChange({}, validFormData())).rejects.toThrow("REDIRECT");

    // No issues → redirect to the change detail page
    expect(mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/changes\/[0-9a-f-]{36}$/));

    // Exactly two metadata rows staged: parent_account first, then portfolio
    expect(stagedRows).toHaveLength(2);
    expect(stagedRows[0].dimension).toBe("parent_account");
    expect(stagedRows[0].action_type).toBe("CREATE");
    expect(stagedRows[0].code).toBe("WX8_HOOFD");
    expect(stagedRows[0].msa_parent_account_code).toBe("WX8_MSA_01");
    expect(stagedRows[1].dimension).toBe("portfolio");
    expect(stagedRows[1].action_type).toBe("CREATE");
    expect(stagedRows[1].code).toBe("WX8RP");
    // New parent account does not exist yet → portfolio row carries no link
    expect(stagedRows[1].parent_account_code).toBeNull();
  });

  it("links an existing active parent account on the portfolio CREATE row", async () => {
    stubDbForSuccess();
    // An existing active parent account (reference data + lookup both see it)
    onQuery(/FROM client_config\.parent_account WHERE active_ind = true/i, () => [
      { parent_account_id: 5, parent_account_code: "PENSIOENFONDSEN", msa_parent_account_code: null, active_ind: true },
    ]);
    onQuery(/SELECT 1 FROM client_config\.parent_account/i, () => [{ 1: 1 }]);

    const stagedRows: Array<Record<string, unknown>> = [];
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, (_sql, params) => {
      stagedRows.push(Object.fromEntries(
        (["change_request_id", "dimension", "action_type", "code", "parent_account_code", "msa_parent_account_code"] as const)
          .map((key, i) => [key, params[i]]),
      ));
      return [{ id: stagedRows.length }];
    });

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    await expect(
      createClientOnboardingChange({}, validFormData({ parentAccountCode: "PENSIOENFONDSEN" })),
    ).rejects.toThrow("REDIRECT");
    expect(mockRedirect).toHaveBeenCalled();

    // Only the portfolio row is staged (existing parent account → no parent_account CREATE)
    expect(stagedRows).toHaveLength(1);
    expect(stagedRows[0].dimension).toBe("portfolio");
    expect(stagedRows[0].parent_account_code).toBe("PENSIOENFONDSEN");
  });

  it("surfaces duplicate portfolio-code issues from the staging helper", async () => {
    stubDbForSuccess();
    // Portfolio code already exists (active or retired row)
    onQuery(/SELECT 1 FROM client_config\.portfolio/i, () => [{ 1: 1 }]);

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    const result = await createClientOnboardingChange({}, validFormData());

    expect(result.issues).toBeDefined();
    expect(result.issues!.some((i) => i.includes('Portfolio code "WX8RP" bestaat al.'))).toBe(true);
    // Duplicate portfolio → no redirect
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("surfaces duplicate parent-account-code issues from the staging helper", async () => {
    stubDbForSuccess();
    // Reference data: parent account absent (action stages parent_account CREATE)
    onQuery(/FROM client_config\.parent_account WHERE active_ind = true/i, () => []);
    // Staging lookup: code already exists → validation issue
    onQuery(/SELECT 1 FROM client_config\.parent_account/i, () => [{ 1: 1 }]);

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    const result = await createClientOnboardingChange({}, validFormData());

    expect(result.issues).toBeDefined();
    expect(result.issues!.some((i) => i.includes('Parent account code "WX8_HOOFD" bestaat al.'))).toBe(true);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("rejects an invalid parent-account code format at zod level", async () => {
    stubDbForSuccess();

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    const result = await createClientOnboardingChange({}, validFormData({ parentAccountCode: "invalid code!" }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.some((i) => i.includes("hoofdletters, cijfers en underscores"))).toBe(true);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows an empty parent-account metadata step (portfolio CREATE only)", async () => {
    stubDbForSuccess();

    const stagedRows: Array<Record<string, unknown>> = [];
    onQuery(/INSERT INTO client_config\.change_portfolio_metadata_request/i, (_sql, params) => {
      stagedRows.push(Object.fromEntries(
        (["change_request_id", "dimension", "action_type", "code", "parent_account_code", "msa_parent_account_code"] as const)
          .map((key, i) => [key, params[i]]),
      ));
      return [{ id: stagedRows.length }];
    });

    const { createClientOnboardingChange } = await import("@/app/changes/new/client-onboarding-actions");
    await expect(
      createClientOnboardingChange({}, validFormData({ parentAccountCode: "", msaParentAccountCode: "" })),
    ).rejects.toThrow("REDIRECT");
    expect(mockRedirect).toHaveBeenCalled();
    expect(stagedRows).toHaveLength(1);
    expect(stagedRows[0].dimension).toBe("portfolio");
    expect(stagedRows[0].parent_account_code).toBeNull();
    expect(stagedRows[0].msa_parent_account_code).toBeNull();
  });
});
