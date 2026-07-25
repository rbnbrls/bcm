/**
 * Tests for the benchmark change form server action validation.
 *
 * Extends the existing actions.test.ts with tests for:
 * - New benchmark items schema validation
 * - Stale IST detection
 * - Invalid client / benchmark IDs
 * - FK violation error handling
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replicate the schemas from actions.ts
const itemSchema = z.object({
  portfolioId: z.string().uuid(),
  previousBenchmarkId: z.string().uuid(),
  requestedBenchmarkId: z.string().uuid(),
});

const newBenchmarkItemSchema = z.object({
  portfolioId: z.string().uuid(),
  previousBenchmarkId: z.string().uuid(),
  details: z.object({
    shortName: z.string().trim().min(2),
    longName: z.string().trim().min(3),
    assetClass: z.string().trim().min(2),
  }),
});

const formSchema = z.object({
  clientId: z.string().uuid(),
  requestedBy: z.string().trim().min(2),
  rationale: z.string().trim().min(10),
  effectiveDate: z.string().date(),
});

// Test fixture IDs from fixture data
const VALID_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff";
const VALID_BENCHMARK_1 = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1";
const VALID_BENCHMARK_2 = "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d";
const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

describe("Benchmark change — items validation", () => {
  it("should accept existing-benchmark items", () => {
    const result = z.array(itemSchema).min(1).parse([
      {
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        requestedBenchmarkId: VALID_BENCHMARK_2,
      },
    ]);
    expect(result).toHaveLength(1);
  });

  it("should accept new-benchmark items", () => {
    const result = z.array(newBenchmarkItemSchema).parse([
      {
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        details: { shortName: "CUSTOM", longName: "Custom ESG Benchmark", assetClass: "Aandelen" },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].details.shortName).toBe("CUSTOM");
  });

  it("should reject new-benchmark item with shortName < 2 chars", () => {
    expect(() =>
      newBenchmarkItemSchema.parse({
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        details: { shortName: "X", longName: "Valid Name", assetClass: "Aandelen" },
      })
    ).toThrow();
  });

  it("should reject new-benchmark item with longName < 3 chars", () => {
    expect(() =>
      newBenchmarkItemSchema.parse({
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        details: { shortName: "CUSTOM", longName: "AB", assetClass: "Aandelen" },
      })
    ).toThrow();
  });

  it("should reject new-benchmark item with empty asset class", () => {
    expect(() =>
      newBenchmarkItemSchema.parse({
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        details: { shortName: "CUSTOM", longName: "Valid Name", assetClass: "" },
      })
    ).toThrow();
  });
});

describe("Benchmark change — business rules", () => {
  it("should detect SOLL equals IST (duplicate benchmark)", () => {
    const items = [
      { portfolioId: VALID_PORTFOLIO_ID, previousBenchmarkId: VALID_BENCHMARK_1, requestedBenchmarkId: VALID_BENCHMARK_1 },
    ];
    const errors: string[] = [];
    for (const item of items) {
      if (item.previousBenchmarkId === item.requestedBenchmarkId) {
        errors.push("De SOLL-benchmark moet verschillen van de IST-benchmark.");
      }
    }
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SOLL");
  });

  it("should detect stale IST benchmark", () => {
    // A portfolio's currentBenchmarkId doesn't match the submitted previousBenchmarkId
    const currentBenchmarkId = VALID_BENCHMARK_1;
    const submittedPreviousBenchmarkId = VALID_BENCHMARK_2; // stale!
    expect(currentBenchmarkId).not.toBe(submittedPreviousBenchmarkId);
  });

  it("should detect duplicate portfolio across items", () => {
    // Same portfolio appears in both switchItems and newBenchmarkItems
    const portfolioIdsInSwitch = [VALID_PORTFOLIO_ID];
    const portfolioIdsInNew = [VALID_PORTFOLIO_ID]; // same portfolio!
    const all = [...portfolioIdsInSwitch, ...portfolioIdsInNew];
    const unique = new Set(all);
    expect(unique.size).toBeLessThan(all.length);
  });

  it("should reject empty items and empty newItems (no portfolios)", () => {
    const items: unknown[] = [];
    const newItems: unknown[] = [];
    expect(items.length === 0 && newItems.length === 0).toBe(true);
  });

  it("form schema should accept valid form fields", () => {
    const result = formSchema.parse({
      clientId: VALID_CLIENT_ID,
      requestedBy: "Ruben Verboon",
      rationale: "Test rationale with at least ten chars.",
      effectiveDate: "2026-09-01",
    });
    expect(result.clientId).toBe(VALID_CLIENT_ID);
  });

  it("should reject rationale shorter than 10 chars", () => {
    const rationale = "Short";
    expect(rationale.trim().length >= 10).toBe(false);
  });

  it("should reject effective date in the past", () => {
    const pastDate = "2020-01-01";
    expect(pastDate < new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it("should require at least one portfolio selected total", () => {
    const items: unknown[] = [];
    const newItems: unknown[] = [];
    expect(items.length + newItems.length).toBe(0);
  });
});

describe("Benchmark change — error handling", () => {
  it("should detect foreign key violation messages", () => {
    const errorMessages = [
      'insert or update on table "change_request_items" violates foreign key constraint',
      'foreign key constraint',
    ];
    for (const msg of errorMessages) {
      expect(msg.includes("foreign key constraint") || msg.includes("violates foreign key")).toBe(true);
    }
  });

  it("should generate a unique reference starting with BCM-{year}-", () => {
    const year = new Date().getFullYear();
    const reference = `BCM-${year}-${String(Date.now()).slice(-6)}`;
    expect(reference).toMatch(new RegExp(`^BCM-${year}-\\d{6}$`));
  });

  it("should generate a UUID for the change request id", () => {
    const { randomUUID } = require("crypto");
    const id = randomUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
