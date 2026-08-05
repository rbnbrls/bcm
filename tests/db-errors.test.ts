/**
 * Unit tests for lib/db-errors.ts — constraint-error detection and
 * friendly-message mapping used by the create-benchmark-change action.
 *
 * Regression focus (t_a542b0f4): a check-constraint violation like
 * `change_portfolio_configuration_long_name_check` must be detected and
 * surfaced as a friendly Dutch message, not as raw PostgreSQL error text.
 */
import { describe, it, expect } from "vitest";
import {
  getDbConstraintError,
  friendlyDbConstraintMessage,
  type DbConstraintErrorInfo,
} from "@/lib/db-errors";

function pgError(overrides: Record<string, unknown>): Error {
  // Simulates postgres.js PostgresError shape (code + constraint_name/table_name)
  return Object.assign(new Error("new row for relation \"change_portfolio_configuration\" violates check constraint \"change_portfolio_configuration_long_name_check\""), {
    severity: "ERROR",
    severity_local: "ERROR",
    code: "23514",
    ...overrides,
  }) as Error;
}

describe("getDbConstraintError", () => {
  it("detects a check-constraint violation (SQLSTATE 23514) and extracts constraint/table/column", () => {
    const err = pgError({
      constraint_name: "change_portfolio_configuration_long_name_check",
      table_name: "change_portfolio_configuration",
      column_name: "long_name",
    });
    const info = getDbConstraintError(err);
    expect(info).not.toBeNull();
    expect(info!.code).toBe("23514");
    expect(info!.constraint).toBe("change_portfolio_configuration_long_name_check");
    expect(info!.table).toBe("change_portfolio_configuration");
    expect(info!.column).toBe("long_name");
  });

  it("detects unique violations (23505)", () => {
    const err = pgError({
      code: "23505",
      constraint_name: "uq_onboarding_client_status",
    });
    const info = getDbConstraintError(err);
    expect(info?.code).toBe("23505");
    expect(info?.constraint).toBe("uq_onboarding_client_status");
  });

  it("detects foreign key violations (23503)", () => {
    const err = pgError({
      code: "23503",
      constraint_name: "change_requests_client_id_fkey",
    });
    expect(getDbConstraintError(err)?.code).toBe("23503");
  });

  it("detects not-null (23502) and string-too-long (22001) violations", () => {
    expect(getDbConstraintError(pgError({ code: "23502" }))?.code).toBe("23502");
    expect(getDbConstraintError(pgError({ code: "22001" }))?.code).toBe("22001");
  });

  it("falls back to the message pattern when no SQLSTATE code is present", () => {
    // A plain Error with the PostgreSQL text but no structured fields.
    const err = new Error(
      'new row for relation "change_portfolio_configuration" violates check constraint "change_portfolio_configuration_long_name_check"',
    );
    const info = getDbConstraintError(err);
    expect(info).not.toBeNull();
    expect(info!.code).toBe("unknown");
  });

  it("accepts the `constraint` alias (other drivers / mocks)", () => {
    const err = new Error("violates check constraint");
    (err as unknown as { constraint: string }).constraint = "some_check";
    const info = getDbConstraintError(err);
    expect(info?.constraint).toBe("some_check");
  });

  it("returns null for non-constraint errors", () => {
    expect(getDbConstraintError(new Error("random failure"))).toBeNull();
    expect(getDbConstraintError("string error")).toBeNull();
    expect(getDbConstraintError(null)).toBeNull();
    expect(getDbConstraintError(undefined)).toBeNull();
    expect(getDbConstraintError({ code: "42P01" })).toBeNull(); // undefined_table
  });
});

describe("friendlyDbConstraintMessage", () => {
  const base: DbConstraintErrorInfo = { code: "23514" };

  it("returns a friendly Dutch message for check violations — no raw constraint name", () => {
    const msg = friendlyDbConstraintMessage({
      ...base,
      constraint: "change_portfolio_configuration_long_name_check",
    });
    expect(msg).toMatch(/databasebeperking/);
    expect(msg).not.toContain("change_portfolio_configuration_long_name_check");
    expect(msg).not.toContain("violates");
  });

  it("maps unique / not-null / too-long to their specific messages", () => {
    expect(friendlyDbConstraintMessage({ code: "23505" })).toMatch(/bestaat al/);
    expect(friendlyDbConstraintMessage({ code: "23502" })).toMatch(/verplichte waarde ontbreekt/);
    expect(friendlyDbConstraintMessage({ code: "22001" })).toMatch(/te lang/);
  });

  it("maps FK (23503) and unknown codes to the generic inconsistency message", () => {
    expect(friendlyDbConstraintMessage({ code: "23503" })).toMatch(/inconsistentie/);
    expect(friendlyDbConstraintMessage({ code: "12345" })).toMatch(/inconsistentie/);
  });
});
