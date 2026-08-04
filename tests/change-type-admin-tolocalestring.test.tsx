// @vitest-environment jsdom
/**
 * Regression tests for GH issue #465 / kanban t_88542b9a
 * "TypeError: undefined is not an object (evaluating 'e.toLocaleString')"
 * on https://bcm.7rb.nl/admin/change-types
 *
 * Root cause (t_623807c7): the production `change_type_config` table contains
 * a legacy row auto-created by the 3NF migration (scripts/migrate.mjs
 * "Auto-created during 3NF migration — legacy change type") whose `cost` jsonb
 * column is the DDL default `'{}'` (lib/db.ts `cost jsonb NOT NULL DEFAULT
 * '{}'::jsonb`). mapRowToChangeTypeConfig only falls back to a default cost
 * object when `cost` is NULL — an empty object passes through unchanged, so
 * `changeType.cost.baseCost` / `costCurrency` are undefined, and
 * ChangeTypeAdminRow called formatCurrency(undefined, undefined)
 * (app/admin/change-types/change-type-admin-table.tsx:81), which evaluated
 * `amount.toLocaleString(...)` (lib/change-type-catalog.ts) on undefined.
 *
 * These tests FAIL on the unfixed code and PASS after the guard fix.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCurrency } from "@/lib/change-type-catalog";

// Stub the server actions module so the table render test only exercises the
// render path that crashed in production (no server action wiring needed).
vi.mock("@/app/admin/change-types/actions", () => ({
  updateChangeTypeAdmin: vi.fn(),
  updateChangeTypeActiveAdmin: vi.fn(),
}));

// --- exact copy of the parseJsonColumn semantics in lib/db.ts:3534-3544 ---
function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

const COST_FALLBACK = { baseCost: 0, costCurrency: "EUR", description: "" };

// Mirror of the prod orphan row (id 91fa7a62-… / slug 'benchmark-switch').
function orphanChangeTypeRow() {
  return {
    id: "91fa7a62-d4ab-4942-bf5e-556df41536e3",
    slug: "benchmark-switch",
    name: "benchmark_switch",
    description: "Auto-created during 3NF migration — legacy change type",
    category: "general",
    fields: [],
    cost: parseJsonColumn("{ }" as unknown, COST_FALLBACK),
    defaultLeadDays: 5,
    stakeholders: [],
    workflow: "default",
    processFlow: [],
    active: true,
    sortOrder: 0,
    createdAt: "2026-07-27T21:18:13.000Z",
    updatedAt: "2026-07-27T21:18:13.000Z",
  } as any;
}

describe("regression: change-types view survives cost:{} rows (GH #465)", () => {
  it("data path: mapRowToChangeTypeConfig passes an empty cost object through (no fallback)", () => {
    // prod row: cost jsonb = '{}'  (INSERT in migrate.mjs omitted cost → DDL default)
    const cost = parseJsonColumn<{ baseCost?: number }>("{}" as unknown, COST_FALLBACK);
    expect(cost).toEqual({});
    expect(cost.baseCost).toBeUndefined(); // <- the field the admin table formats
  });

  it("formatCurrency(null/undefined) returns a placeholder instead of throwing", () => {
    // change-type-admin-table.tsx:81 → formatCurrency(changeType.cost.baseCost, ...)
    expect(() => formatCurrency(undefined as unknown as number, "EUR")).not.toThrow();
    expect(() => formatCurrency(null as unknown as number, "EUR")).not.toThrow();
    expect(formatCurrency(undefined as unknown as number, "EUR")).toBe("—");
    expect(formatCurrency(null as unknown as number, "EUR")).toBe("—");
    // missing currency alone must not crash either (orphan row has cost = {})
    expect(() => formatCurrency(100, undefined as unknown as string)).not.toThrow();
  });

  it("valid values are formatted exactly as before the fix", () => {
    expect(formatCurrency(500, "EUR")).toBe("€ 500");
    expect(formatCurrency(2500, "EUR")).toBe("€ 2.500");
    expect(formatCurrency(5000.5, "EUR")).toMatch(/€ 5\.000/);
    expect(formatCurrency(1000, "USD")).toContain("$");
    expect(formatCurrency(0, "EUR")).toContain("0");
  });

  it("RED/GREEN: ChangeTypeAdminTable renders without crashing for cost:{} rows", async () => {
    const { ChangeTypeAdminTable } = await import(
      "@/app/admin/change-types/change-type-admin-table"
    );

    let view: ReturnType<typeof render>;
    expect(() => {
      view = render(<ChangeTypeAdminTable changeTypes={[orphanChangeTypeRow()]} />);
    }).not.toThrow();

    // The orphan row still renders its name — the table is functional.
    expect(screen.getByText("benchmark_switch")).toBeTruthy();
  });
});
