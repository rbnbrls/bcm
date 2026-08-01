/**
 * Unit tests for the client_onboarding_staging CRUD helpers
 * (lib/onboarding-staging-db.ts).
 *
 * The database module (@/lib/db) is mocked, so these tests exercise the
 * helpers' SQL construction, parameter binding, row mapping, and error
 * translation without a real PostgreSQL instance:
 *
 *  - save: inserts a row with status 'pending'; validation errors and the
 *    duplicate-client-code unique violation (SQLSTATE 23505 on
 *    uq_onboarding_client_status) surface as typed errors.
 *  - read: by staging_id returns a mapped row or null; by client_code returns
 *    rows (optionally filtered by status).
 *  - update: changes status and/or metadata, returns the updated row or null;
 *    invalid status and duplicate-client-code violations are typed errors.
 *  - delete: returns whether a row was deleted.
 *
 * Every assertion on the mocked SQL verifies that user input is bound as a
 * parameter (never string-interpolated), which is the injection-safety
 * contract of the helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

vi.mock("@/lib/db", () => ({
  sql: mockSql,
}));

vi.mock("@/lib/sentry-helper", () => ({
  captureError: vi.fn(),
}));

import {
  saveClientOnboardingStaging,
  getClientOnboardingStagingByStagingId,
  getClientOnboardingStagingByClientCode,
  updateClientOnboardingStaging,
  deleteClientOnboardingStaging,
  DuplicateClientOnboardingError,
  OnboardingStagingValidationError,
  validateStagingInput,
  type SaveClientOnboardingStagingInput,
  type OnboardingStagingRow,
} from "@/lib/onboarding-staging-db";

// ── Fixtures ────────────────────────────────────────────────────────────

const VALID_INPUT: SaveClientOnboardingStagingInput = {
  changeRequestId: "11111111-2222-4333-8444-555555555555",
  clientCode: "adp",
  clientName: "ADP Pensioenfonds",
  portfolioCode: "adp",
  parentAccountCode: "adp_main",
  assetClassCode: "fi",
  subAssetClassCode: "hyg",
  managerCode: "rob",
  benchmarkCode: "msci-world",
  npcClassificationId: 3,
  longName: "ADP Pensioenfonds Hybride",
  shortName: "ADP",
  effectiveFrom: "2026-01-01",
  effectiveUntil: "2030-12-31",
};

/** Same payload with already-normalized (uppercase) codes. */
const UPPERCASE_INPUT: SaveClientOnboardingStagingInput = {
  changeRequestId: VALID_INPUT.changeRequestId,
  clientCode: "ADP",
  clientName: "ADP Pensioenfonds",
  portfolioCode: "ADP",
  parentAccountCode: "ADP_MAIN",
  assetClassCode: "FI",
  subAssetClassCode: "HYG",
  managerCode: "ROB",
  benchmarkCode: "MSCI-WORLD",
  npcClassificationId: 3,
  longName: "ADP Pensioenfonds Hybride",
  shortName: "ADP",
  effectiveFrom: "2026-01-01",
  effectiveUntil: "2030-12-31",
};

function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    staging_id: "42", // bigint comes back as a string from postgres.js
    change_request_id: VALID_INPUT.changeRequestId,
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
    effective_until: new Date("2030-12-31T00:00:00Z"),
    status: "pending",
    apply_error: null,
    created_at: new Date("2026-08-01T12:00:00Z"),
    updated_at: new Date("2026-08-01T12:00:00Z"),
    processed_at: null,
    ...overrides,
  };
}

/** The most recent mocked sql call, with the template joined and params split out. */
function lastSqlCall() {
  const calls = mockSql.mock.calls;
  const [strings, ...values] = calls[calls.length - 1] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return { sql: strings.join("?"), values, strings };
}

beforeEach(() => {
  mockSql.mockReset();
});

describe("saveClientOnboardingStaging", () => {
  it("inserts a new row with status 'pending' and returns the mapped row", async () => {
    mockSql.mockResolvedValue([makeRow()]);

    const saved = await saveClientOnboardingStaging(VALID_INPUT);

    expect(saved.stagingId).toBe(42);
    expect(saved.status).toBe("pending");
    expect(saved.clientCode).toBe("ADP");

    const call = lastSqlCall();
    expect(call.sql).toContain("INSERT INTO client_config.client_onboarding_staging");
    expect(call.sql).toContain("'pending'");
    // All user values are bound parameters, not interpolated into the SQL.
    expect(call.sql).not.toContain("ADP");
    expect(call.sql).not.toContain("msci-world");
    expect(call.values).toEqual(
      expect.arrayContaining([
        VALID_INPUT.changeRequestId,
        "ADP", // uppercased client code
        "ADP Pensioenfonds",
        "ADP", // uppercased portfolio code
        "ADP_MAIN", // uppercased parent account code
        "FI", // uppercased asset class
        "HYG", // uppercased sub asset class
        "ROB", // uppercased manager
        "MSCI-WORLD", // uppercased benchmark
        3,
        "ADP Pensioenfonds Hybride",
        "ADP",
        "2026-01-01",
        "2030-12-31",
      ]),
    );
  });

  it("rejects duplicate client code with DuplicateClientOnboardingError (unique violation 23505)", async () => {
    mockSql.mockRejectedValue({
      code: "23505",
      constraint_name: "uq_onboarding_client_status",
      detail: "Key (client_code, status)=(ADP, pending) already exists.",
    });

    await expect(saveClientOnboardingStaging(VALID_INPUT)).rejects.toThrow(
      DuplicateClientOnboardingError,
    );
    await expect(saveClientOnboardingStaging(VALID_INPUT)).rejects.toThrow(
      /client code "ADP"/i,
    );
  });

  it("rejects duplicate change_request_id (different unique constraint) as a plain DB error", async () => {
    mockSql.mockRejectedValue({
      code: "23505",
      constraint_name: "client_onboarding_staging_change_request_id_key",
    });

    const error = await saveClientOnboardingStaging(VALID_INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DuplicateClientOnboardingError);
  });

  it("rethrows non-unique database errors unchanged", async () => {
    const dbError = new Error("connection reset");
    mockSql.mockRejectedValue(dbError);

    await expect(saveClientOnboardingStaging(VALID_INPUT)).rejects.toThrow("connection reset");
  });

  it("throws OnboardingStagingValidationError for invalid input before touching the database", async () => {
    await expect(
      saveClientOnboardingStaging({
        ...VALID_INPUT,
        clientCode: "TOO-LONG-CODE",
      }),
    ).rejects.toThrow(OnboardingStagingValidationError);

    await expect(
      saveClientOnboardingStaging({
        ...VALID_INPUT,
        effectiveUntil: "2020-01-01", // before effectiveFrom
      }),
    ).rejects.toThrow(OnboardingStagingValidationError);

    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe("getClientOnboardingStagingByStagingId", () => {
  it("returns the mapped row for an existing staging id", async () => {
    mockSql.mockResolvedValue([makeRow({ status: "applied", processed_at: new Date("2026-08-02T09:00:00Z") })]);

    const row = await getClientOnboardingStagingByStagingId(42);

    expect(row).not.toBeNull();
    expect(row!.stagingId).toBe(42);
    expect(row!.status).toBe("applied");
    expect(row!.processedAt).toBe("2026-08-02T09:00:00.000Z");
    expect(row!.parentAccountCode).toBe("ADP_MAIN");

    const call = lastSqlCall();
    expect(call.sql).toContain("FROM client_config.client_onboarding_staging");
    expect(call.sql).toContain("WHERE staging_id = ?");
    expect(call.values).toContain(42);
  });

  it("returns null when no row matches", async () => {
    mockSql.mockResolvedValue([]);
    await expect(getClientOnboardingStagingByStagingId(999)).resolves.toBeNull();
  });
});

describe("getClientOnboardingStagingByClientCode", () => {
  it("returns all rows for the client code, newest first", async () => {
    mockSql.mockResolvedValue([
      makeRow({ staging_id: "7", status: "applied" }),
      makeRow({ staging_id: "3", status: "failed", apply_error: "boom" }),
    ]);

    const rows = await getClientOnboardingStagingByClientCode("adp");

    expect(rows).toHaveLength(2);
    expect(rows[0].stagingId).toBe(7);
    expect(rows[1].status).toBe("failed");
    expect(rows[1].applyError).toBe("boom");

    const call = lastSqlCall();
    expect(call.sql).toContain("WHERE client_code = ?");
    expect(call.sql).toContain("ORDER BY staging_id DESC");
    expect(call.values).toContain("ADP"); // uppercased
    expect(call.sql).not.toContain("AND status");
  });

  it("filters by status when requested", async () => {
    mockSql.mockResolvedValue([makeRow()]);

    const rows = await getClientOnboardingStagingByClientCode("adp", { status: "pending" });

    expect(rows).toHaveLength(1);
    // The status condition is emitted as its own bound-parameter fragment.
    const fragmentCalls = mockSql.mock.calls.filter(([strings]) =>
      strings.join("?").includes("AND status = ?"),
    );
    expect(fragmentCalls.length).toBeGreaterThan(0);
    expect(fragmentCalls[0][1]).toBe("pending");
    const outerCall = lastSqlCall();
    expect(outerCall.sql).toContain("WHERE client_code = ?");
    expect(outerCall.values[0]).toBe("ADP"); // uppercased client code
  });

  it("returns an empty array when no rows match", async () => {
    mockSql.mockResolvedValue([]);
    await expect(getClientOnboardingStagingByClientCode("XYZ")).resolves.toEqual([]);
  });
});

describe("updateClientOnboardingStaging", () => {
  it("updates status and metadata and returns the updated row", async () => {
    mockSql.mockResolvedValue([
      makeRow({ status: "applied", processed_at: new Date("2026-08-02T09:00:00Z") }),
    ]);

    const updated = await updateClientOnboardingStaging(42, {
      status: "applied",
      processedAt: "2026-08-02T09:00:00Z",
      longName: "ADP Pensioenfonds Hybride (gewijzigd)",
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("applied");

    const call = lastSqlCall();
    expect(call.sql).toContain("UPDATE client_config.client_onboarding_staging SET");
    expect(call.sql).toContain("WHERE staging_id = ?");
    expect(call.sql).toContain("updated_at            = now()");
    expect(call.values).toEqual(
      expect.arrayContaining(["applied", "2026-08-02T09:00:00Z", 42]),
    );
  });

  it("returns null when no row with the staging id exists", async () => {
    mockSql.mockResolvedValue([]);
    await expect(updateClientOnboardingStaging(999, { status: "applied" })).resolves.toBeNull();
  });

  it("rejects an invalid status before touching the database", async () => {
    await expect(
      updateClientOnboardingStaging(42, { status: "bogus" as never }),
    ).rejects.toThrow(OnboardingStagingValidationError);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("translates a unique violation into DuplicateClientOnboardingError", async () => {
    mockSql.mockRejectedValue({
      code: "23505",
      constraint_name: "uq_onboarding_client_status",
    });

    await expect(
      updateClientOnboardingStaging(42, { clientCode: "ADP" }),
    ).rejects.toThrow(DuplicateClientOnboardingError);
  });
});

describe("deleteClientOnboardingStaging", () => {
  it("returns true when a row was deleted", async () => {
    mockSql.mockResolvedValue([{ staging_id: "42" }]);
    await expect(deleteClientOnboardingStaging(42)).resolves.toBe(true);

    const call = lastSqlCall();
    expect(call.sql).toContain("DELETE FROM client_config.client_onboarding_staging");
    expect(call.sql).toContain("WHERE staging_id = ?");
    expect(call.values).toContain(42);
  });

  it("returns false when no row matched", async () => {
    mockSql.mockResolvedValue([]);
    await expect(deleteClientOnboardingStaging(999)).resolves.toBe(false);
  });
});

describe("validateStagingInput", () => {
  it("returns no issues for a valid (uppercase) payload", () => {
    expect(validateStagingInput(UPPERCASE_INPUT)).toEqual([]);
  });

  it("collects issues for invalid codes and dates", () => {
    const issues = validateStagingInput({
      ...UPPERCASE_INPUT,
      changeRequestId: "not-a-uuid",
      clientCode: "!!",
      clientName: "bad\nname",
      portfolioCode: "x",
      assetClassCode: "F",
      subAssetClassCode: "H",
      managerCode: "RO",
      benchmarkCode: "",
      npcClassificationId: -1,
      longName: "",
      shortName: "",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2020-01-01",
    });
    expect(issues.length).toBeGreaterThanOrEqual(12);
    expect(issues).toEqual(
      expect.arrayContaining([
        "changeRequestId is geen geldige UUID.",
        "clientCode moet uit 1-3 hoofdletters/cijfers bestaan (bijv. ADP).",
        "effectiveUntil mag niet vóór effectiveFrom liggen.",
      ]),
    );
  });

  it("accepts a null parent account code and effective until", () => {
    expect(
      validateStagingInput({
        ...UPPERCASE_INPUT,
        parentAccountCode: null,
        effectiveUntil: null,
      }),
    ).toEqual([]);
  });

  it("rejects lowercase codes (the save helper uppercases before validating)", () => {
    const issues = validateStagingInput({
      ...UPPERCASE_INPUT,
      clientCode: "adp",
      assetClassCode: "fi",
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        "clientCode moet uit 1-3 hoofdletters/cijfers bestaan (bijv. ADP).",
        "assetClassCode moet uit precies 2 hoofdletters bestaan (bijv. FI).",
      ]),
    );
  });
});

// ── SQL injection safety: raw user input never lands in the SQL text ─────

describe("parameterized query contract", () => {
  it("rejects a hostile client code before it can reach the query builder", async () => {
    mockSql.mockResolvedValue([makeRow()]);
    const hostile = "ADP'; DROP TABLE client_onboarding_staging; --";

    await expect(
      saveClientOnboardingStaging({ ...VALID_INPUT, clientCode: hostile }),
    ).rejects.toThrow(OnboardingStagingValidationError);

    // The injection payload never reaches the database layer.
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("selects by client code with the value bound, never embedded", async () => {
    mockSql.mockResolvedValue([]);
    await getClientOnboardingStagingByClientCode("ABC");

    const call = lastSqlCall();
    expect(call.sql).not.toContain("ABC");
    expect(call.values).toContain("ABC");
  });
});

// ── Type-level sanity (compile-time only, no runtime assertions needed) ──

const _rowTypeCheck: OnboardingStagingRow = makeRow() as unknown as OnboardingStagingRow;
void _rowTypeCheck;
