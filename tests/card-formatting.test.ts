/// <reference types="vitest/globals" />
/**
 * Tests for the ChangeTypeCard component rendering logic.
 *
 * Since React server/client components are tricky to test in isolation,
 * these tests verify the data-model aspects used by the card.
 */
import { describe, it, expect } from "vitest";
import type { ChangeTypeConfig } from "@/lib/types";
import {
  formatCurrency,
  formatLeadDays,
  formatCategoryLabel,
} from "@/lib/change-type-catalog";

const testConfig: ChangeTypeConfig = {
  id: "1",
  slug: "benchmark_switch",
  name: "Benchmarkwissel",
  description: "Wijzig de benchmark van een of meerdere portefeuilles.",
  category: "benchmark",
  fields: [],
  istSollMapping: [],
  cost: { baseCost: 0, costCurrency: "EUR", perItemCost: 500, description: "€ 500 per portefeuille" },
  defaultLeadDays: 7,
  stakeholders: [],
  workflow: "benchmark_switch",
  active: true,
  sortOrder: 10,
  createdAt: "",
  updatedAt: "",
};

describe("formatCurrency", () => {
  it("should format a currency value in EUR", () => {
    expect(formatCurrency(500, "EUR")).toBe("€ 500");
    expect(formatCurrency(2500, "EUR")).toBe("€ 2.500");
    // nl-NL locale uses decimal comma, trailing zeros are dropped by default
    expect(formatCurrency(5000.50, "EUR")).toMatch(/€ 5\.000/);
  });

  it("should format a currency value in USD", () => {
    // en-US locale uses commas for thousands
    expect(formatCurrency(1000, "USD")).toContain("1");
    expect(formatCurrency(1000, "USD")).toContain("$");
  });

  it("should handle zero", () => {
    expect(formatCurrency(0, "EUR")).toContain("0");
  });
});

describe("formatLeadDays", () => {
  it("should format singular day", () => {
    expect(formatLeadDays(1)).toBe("1 dag");
  });

  it("should format plural days", () => {
    expect(formatLeadDays(7)).toBe("7 dagen");
    expect(formatLeadDays(30)).toBe("30 dagen");
  });
});

describe("formatCategoryLabel", () => {
  it("should format known categories", () => {
    expect(formatCategoryLabel("benchmark")).toBe("Benchmark");
    expect(formatCategoryLabel("fee")).toBe("Tarief");
    expect(formatCategoryLabel("mandate")).toBe("Mandaat");
    expect(formatCategoryLabel("custodian")).toBe("Custodian");
    expect(formatCategoryLabel("rebalance")).toBe("Herweging");
  });

  it("should fall back to the raw category for unknown categories", () => {
    expect(formatCategoryLabel("other")).toBe("other");
  });
});
